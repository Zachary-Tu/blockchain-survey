import type { Metadata } from "next";
import Link from "next/link";
import taxonomy from "../../../public/data/cue-taxonomy-v4-v2.json";

export const metadata: Metadata = {
  title: "线索标签与文献依据｜Boundary Lab",
  description: "Boundary Lab 第四版分层线索标签的代码、披露步骤、操作化说明与参考文献。",
};

const disclosureNames: Record<string, string> = {
  G0: "匿名曲线基线",
  GI1: "序列类型",
  GI2: "时间轴与单位",
  DI1: "资产名称",
  DI2: "资产背景",
  DI3: "高优先级事件",
  DI4: "低优先级事件",
  FULL: "完整信息快照",
};

export default function CueMethodologyPage() {
  return (
    <main className="mod-site mod-method-page">
      <header className="mod-topbar">
        <Link href="/" className="mod-wordmark"><span>BOUNDARY</span> LAB <b>04</b></Link>
        <Link className="mod-method-back" href="/">返回研究者操作台</Link>
      </header>

      <section className="mod-method-hero">
        <span className="mod-eyebrow">METHOD APPENDIX · {taxonomy.schemaVersion}</span>
        <h1>每一步只问<br />本步真正新增的线索。</h1>
        <p>{taxonomy.purpose}</p>
        <div className="mod-method-paths">
          <span>一般信息 · {taxonomy.disclosureAccounting.general.updates} 步</span>
          <span>领域信息 · {taxonomy.disclosureAccounting.domain.updates} 步</span>
          <span>组合路径 · {taxonomy.disclosureAccounting.combined.updates} 步</span>
          <span>每步 · {taxonomy.selectionRules.optionsPerDisclosure} 个标签</span>
        </div>
      </section>

      <section className="mod-method-notice">
        <strong>方法边界</strong>
        <p>这些标签是基于相关机制研究建立的项目专用操作化自报项目，不是从单一已验证量表逐字翻译而来。DI2 的币种背景子项是本项目对“领域知识”上位机制的具体化。</p>
      </section>

      <section className="mod-method-sets" aria-label="各披露阶段标签">
        {taxonomy.sets.map((set) => (
          <article key={set.disclosureKey}>
            <header>
              <span>{set.disclosureKey}</span>
              <div><h2>{disclosureNames[set.disclosureKey]}</h2><p>{set.question}</p></div>
            </header>
            <ol>
              {set.options.map((option) => (
                <li key={option.code}>
                  <code>{option.code}</code>
                  <strong>{option.label}</strong>
                  <p>{option.mechanism}</p>
                  <small>{option.references.join(" · ")}{"exclusive" in option && option.exclusive ? " · 互斥" : ""}</small>
                </li>
              ))}
            </ol>
          </article>
        ))}
      </section>

      <section className="mod-method-references">
        <div className="mod-section-heading">
          <span className="mod-index">R</span>
          <div><span className="mod-eyebrow">REFERENCES</span><h2>标签依据的研究清单</h2></div>
          <p>链接均指向期刊、出版社或论文的正式页面。</p>
        </div>
        <ol>
          {taxonomy.references.map((reference) => (
            <li key={reference.id} id={reference.id}>
              <span>{reference.id}</span>
              <div>
                <p>{reference.citation}</p>
                <small>{reference.usedFor}</small>
              </div>
              <a href={reference.url} target="_blank" rel="noreferrer">DOI / 原文 ↗</a>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
