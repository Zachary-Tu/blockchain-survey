import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import * as tf from "@tensorflow/tfjs";

import { parseKataGoModelV8 } from "web-katrain-engine/src/engine/katago/loadModelV8";
import { KataGoModelV8Tf } from "web-katrain-engine/src/engine/katago/modelV8";

const projectPath = (...parts: string[]) => path.join(process.cwd(), ...parts);

test("KataGo 小模型可解压并由浏览器引擎解析", () => {
  const compressed = fs.readFileSync(projectPath("public", "tim-classroom", "go", "engine", "katago-small.bin.gz"));
  assert.deepEqual([...compressed.subarray(0, 2)], [0x1f, 0x8b]);
  const model = parseKataGoModelV8(gunzipSync(compressed));
  assert.equal(model.modelVersion, 8);
  assert.match(model.modelName, /^g170-b6c96-/);
});

test("KataGo b10 强化模型可解压并保留官方网络结构", () => {
  const compressed = fs.readFileSync(projectPath("public", "tim-classroom", "go", "engine", "katago-b10.bin.gz"));
  assert.deepEqual([...compressed.subarray(0, 2)], [0x1f, 0x8b]);
  const model = parseKataGoModelV8(gunzipSync(compressed));
  assert.equal(model.modelVersion, 8);
  assert.equal(model.modelName, "b10c128-s1141046784-d204142634");
  assert.equal(model.trunk.numBlocks, 10);
  assert.equal(model.trunk.trunkNumChannels, 128);
});

test("KataGo b10 强化模型能完成有限值前向推理", async () => {
  const compressed = fs.readFileSync(projectPath("public", "tim-classroom", "go", "engine", "katago-b10.bin.gz"));
  const parsed = parseKataGoModelV8(gunzipSync(compressed));
  const model = new KataGoModelV8Tf(parsed);
  const spatial = tf.zeros([1, 9, 9, 22]) as tf.Tensor4D;
  const global = tf.zeros([1, 19]) as tf.Tensor2D;
  const output = model.forwardPolicyValue(spatial, global);
  const values = await Promise.all([
    output.policy.data(),
    output.policyPass.data(),
    output.value.data(),
    output.scoreValue.data(),
  ]);
  assert.deepEqual(output.policy.shape, [1, 9, 9, 1]);
  assert.ok(values.every((tensor) => Array.from(tensor).every(Number.isFinite)));
  tf.dispose([spatial, global, output.policy, output.policyPass, output.value, output.scoreValue]);
  model.dispose();
});

test("新增机器人形象与 Fairy-Stockfish 象棋引擎资产完整", () => {
  const robot = fs.readFileSync(projectPath("public", "tim-classroom", "go", "opponents", "robot-tim.png"));
  assert.deepEqual([...robot.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const wasm = fs.readFileSync(projectPath("public", "tim-classroom", "xiangqi", "engine", "stockfish.wasm"));
  assert.deepEqual([...wasm.subarray(0, 4)], [0, 97, 115, 109]);
  const notice = fs.readFileSync(projectPath("public", "tim-classroom", "xiangqi", "engine", "NOTICE.txt"), "utf8");
  assert.match(notice, /Fairy-Stockfish WebAssembly 1\.1\.11/);
  assert.match(notice, /GPL/);
  for (const filename of ["young-tim.png", "woodcutter-tim.png", "immortal-tim.png"]) {
    assert.ok(fs.statSync(projectPath("public", "tim-classroom", "xiangqi", "opponents", filename)).size > 100_000);
  }
});

test("WASM 降级文件与第三方许可随站点发布", () => {
  for (const filename of [
    "tfjs-backend-wasm.wasm",
    "tfjs-backend-wasm-simd.wasm",
    "tfjs-backend-wasm-threaded-simd.wasm",
  ]) {
    const wasm = fs.readFileSync(projectPath("public", "tfjs", filename));
    assert.deepEqual([...wasm.subarray(0, 4)], [0x00, 0x61, 0x73, 0x6d], `${filename} 不是有效 WASM`);
  }
  const notice = fs.readFileSync(projectPath("public", "tim-classroom", "go", "engine", "NOTICE.txt"), "utf8");
  assert.match(notice, /Web KaTrain/);
  assert.match(notice, /KataGo/);
  assert.match(notice, /MIT/);
});
