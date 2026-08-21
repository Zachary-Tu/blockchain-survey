import fs from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

/**
 * KataGo's older training networks are published as whitespace-delimited text.
 * Web KaTrain expects the same model schema with each tensor stored as a
 * little-endian Float32 block after an `@BIN@` marker. This converter changes
 * only that serialization; model metadata and numeric weights are preserved.
 *
 * Usage:
 *   npm run go:model:convert -- input.txt.gz output.bin.gz
 */

class TextModelConverter {
  private readonly source: string;
  private cursor = 0;
  private readonly chunks: Buffer[] = [];
  private tensorCount = 0;
  private floatCount = 0;

  constructor(source: string) {
    this.source = source;
  }

  private skipWhitespace() {
    while (this.cursor < this.source.length && /\s/.test(this.source[this.cursor])) {
      this.cursor += 1;
    }
  }

  private takeToken() {
    this.skipWhitespace();
    const start = this.cursor;
    while (this.cursor < this.source.length && !/\s/.test(this.source[this.cursor])) {
      this.cursor += 1;
    }
    if (start === this.cursor) throw new Error("Unexpected end of KataGo text model");
    return this.source.slice(start, this.cursor);
  }

  readToken() {
    const token = this.takeToken();
    this.chunks.push(Buffer.from(`${token}\n`, "utf8"));
    return token;
  }

  readInt() {
    const token = this.readToken();
    const value = Number.parseInt(token, 10);
    if (!Number.isSafeInteger(value)) throw new Error(`Invalid integer token: ${token}`);
    return value;
  }

  readFloatAscii() {
    const token = this.readToken();
    const value = Number.parseFloat(token);
    if (!Number.isFinite(value)) throw new Error(`Invalid float token: ${token}`);
    return value;
  }

  readTensor(count: number) {
    if (!Number.isSafeInteger(count) || count < 0) throw new Error(`Invalid tensor length: ${count}`);
    const bytes = Buffer.allocUnsafe(count * Float32Array.BYTES_PER_ELEMENT);
    for (let index = 0; index < count; index += 1) {
      const token = this.takeToken();
      const value = Number.parseFloat(token);
      if (!Number.isFinite(value)) {
        throw new Error(`Invalid tensor float at ${this.floatCount + index}: ${token}`);
      }
      bytes.writeFloatLE(value, index * Float32Array.BYTES_PER_ELEMENT);
    }
    this.chunks.push(Buffer.from("@BIN@", "ascii"), bytes, Buffer.from("\n", "ascii"));
    this.tensorCount += 1;
    this.floatCount += count;
  }

  finish() {
    this.skipWhitespace();
    if (this.cursor !== this.source.length) {
      throw new Error(`Unconsumed model data begins at byte ${this.cursor}`);
    }
    return {
      data: Buffer.concat(this.chunks),
      tensorCount: this.tensorCount,
      floatCount: this.floatCount,
    };
  }
}

type Parser = TextModelConverter;

function parseBatchNorm(parser: Parser) {
  parser.readToken();
  const channels = parser.readInt();
  parser.readFloatAscii();
  const hasScale = parser.readInt() !== 0;
  const hasBias = parser.readInt() !== 0;
  parser.readTensor(channels);
  parser.readTensor(channels);
  if (hasScale) parser.readTensor(channels);
  if (hasBias) parser.readTensor(channels);
}

function parseActivation(parser: Parser, modelVersion: number) {
  parser.readToken();
  if (modelVersion >= 11) parser.readToken();
}

function parseConv2d(parser: Parser) {
  parser.readToken();
  const kernelY = parser.readInt();
  const kernelX = parser.readInt();
  const inChannels = parser.readInt();
  const outChannels = parser.readInt();
  parser.readInt();
  parser.readInt();
  parser.readTensor(kernelY * kernelX * inChannels * outChannels);
  return { outChannels };
}

function parseMatMul(parser: Parser) {
  parser.readToken();
  const inChannels = parser.readInt();
  const outChannels = parser.readInt();
  parser.readTensor(inChannels * outChannels);
  return { outChannels };
}

function parseMatBias(parser: Parser) {
  parser.readToken();
  const channels = parser.readInt();
  parser.readTensor(channels);
}

function convertKataGoModel(source: string) {
  const parser = new TextModelConverter(source);
  const modelName = parser.readToken();
  const modelVersion = parser.readInt();
  if (modelVersion < 8 || modelVersion > 16) {
    throw new Error(`Unsupported KataGo model version ${modelVersion}; expected 8..16`);
  }
  parser.readInt();
  parser.readInt();

  if (modelVersion >= 13) {
    for (let index = 0; index < 7; index += 1) parser.readFloatAscii();
  }

  const metaEncoderVersion = modelVersion >= 15 ? parser.readInt() : 0;
  if (modelVersion >= 15) {
    for (let index = 0; index < 7; index += 1) parser.readInt();
  }
  if (metaEncoderVersion !== 0) {
    throw new Error(`Unsupported meta encoder version ${metaEncoderVersion}`);
  }

  parser.readToken();
  const numBlocks = parser.readInt();
  parser.readInt();
  parser.readInt();
  parser.readInt();
  parser.readInt();
  parser.readInt();
  if (modelVersion >= 15) {
    for (let index = 0; index < 6; index += 1) parser.readInt();
  }

  parseConv2d(parser);
  parseMatMul(parser);

  function parseResidualBlock() {
    const kind = parser.readToken();
    if (kind === "ordinary_block") {
      parser.readToken();
      parseBatchNorm(parser);
      parseActivation(parser, modelVersion);
      parseConv2d(parser);
      parseBatchNorm(parser);
      parseActivation(parser, modelVersion);
      parseConv2d(parser);
      return;
    }

    if (kind === "gpool_block") {
      parser.readToken();
      parseBatchNorm(parser);
      parseActivation(parser, modelVersion);
      parseConv2d(parser);
      parseConv2d(parser);
      parseBatchNorm(parser);
      parseActivation(parser, modelVersion);
      parseMatMul(parser);
      parseBatchNorm(parser);
      parseActivation(parser, modelVersion);
      parseConv2d(parser);
      return;
    }

    if (kind === "nested_bottleneck_block") {
      parser.readToken();
      const numInnerBlocks = parser.readInt();
      parseBatchNorm(parser);
      parseActivation(parser, modelVersion);
      parseConv2d(parser);
      for (let index = 0; index < numInnerBlocks; index += 1) parseResidualBlock();
      parseBatchNorm(parser);
      parseActivation(parser, modelVersion);
      parseConv2d(parser);
      return;
    }

    throw new Error(`Unsupported residual block kind: ${kind}`);
  }

  for (let index = 0; index < numBlocks; index += 1) parseResidualBlock();
  parseBatchNorm(parser);
  parseActivation(parser, modelVersion);

  parser.readToken();
  parseConv2d(parser);
  parseConv2d(parser);
  parseBatchNorm(parser);
  parseActivation(parser, modelVersion);
  parseMatMul(parser);
  parseBatchNorm(parser);
  parseActivation(parser, modelVersion);
  parseConv2d(parser);
  parseMatMul(parser);
  if (modelVersion >= 15) {
    parseMatBias(parser);
    parseActivation(parser, modelVersion);
    parseMatMul(parser);
  }

  parser.readToken();
  parseConv2d(parser);
  parseBatchNorm(parser);
  parseActivation(parser, modelVersion);
  parseMatMul(parser);
  parseMatBias(parser);
  parseActivation(parser, modelVersion);
  parseMatMul(parser);
  parseMatBias(parser);
  parseMatMul(parser);
  parseMatBias(parser);
  parseConv2d(parser);

  const converted = parser.finish();
  return { modelName, modelVersion, ...converted };
}

function readMaybeGzip(filename: string) {
  const input = fs.readFileSync(filename);
  return input[0] === 0x1f && input[1] === 0x8b ? gunzipSync(input) : input;
}

const [inputArgument, outputArgument] = process.argv.slice(2);
if (!inputArgument || !outputArgument) {
  throw new Error("Usage: npm run go:model:convert -- input.txt[.gz] output.bin[.gz]");
}

const inputPath = path.resolve(inputArgument);
const outputPath = path.resolve(outputArgument);
if (inputPath === outputPath) throw new Error("Input and output paths must differ");

const rawInput = readMaybeGzip(inputPath);
const result = convertKataGoModel(rawInput.toString("utf8"));
const output = outputPath.endsWith(".gz") ? gzipSync(result.data, { level: 9 }) : result.data;
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, output);

console.info(
  `Converted ${result.modelName} (v${result.modelVersion}): ${result.tensorCount} tensors, ` +
    `${result.floatCount.toLocaleString()} floats, ${(output.length / 1024 / 1024).toFixed(2)} MiB`,
);
