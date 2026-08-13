# 第四版 V2 分层线索标签与文献依据

## 1. 设计结论

本版不再把一组通用标签展示在所有披露步骤。每个步骤固定显示 5 个与“本步新增信息”对应的选项：G0、GI1、GI2、DI1、DI2、DI3、DI4 与 FULL 各有独立代码。一般信息路径包含 2 次更新，领域信息路径包含 4 次更新，组合路径包含 6 次更新；三条路径都另有 1 次 G0 匿名基线判断。

这些项目用于记录参与者自报的判断机制。它们由图表理解、视觉变点检测、趋势知觉、事件分割与领域知识研究共同支持，但不是从单一成熟量表逐字翻译而来。论文中宜称为“literature-grounded, study-specific cue checklist（基于文献的项目专用线索清单）”。

## 2. 每一步的五个标签

| 披露步骤 | 本步新增信息 | 固定标签 | 主要文献依据 |
|---|---|---|---|
| G0 | 无语义信息 | 趋势/斜率；水平/基线；波动/噪声；突发跳跃/反转；新状态持续性 | R1–R5 |
| GI1 | 序列类型 | 曲线含义；指标典型动态；尖峰信号/扰动；同类指标经验；无影响 | R1、R4–R8 |
| GI2 | 时间轴与单位 | 历史时点；阶段时长；频率/观测密度；单位/量级/刻度；无影响 | R1、R3、R4、R9、R10 |
| DI1 | 资产名称 | 资产类别；历史周期记忆；个人熟悉度；典型走势预期；无影响 | R1、R3、R5、R6、R8 |
| DI2 | 资产背景 | 上线/成熟度；用途定位；运行机制；背景—形态匹配；无影响 | R1、R6–R8 |
| DI3 | 高优先级事件 | 事件—边界邻近；事后方向/水平；事后波动；事件聚集；无影响 | R1、R2、R4、R5 |
| DI4 | 低优先级事件 | 边界细化；短期扰动；事件密度；跨事件印证/冲突；无影响 | R1、R4–R8 |
| FULL | 完整快照 | 曲线结构；坐标时间；指标类型；资产背景；历史事件 | R1–R10 |

## 3. 关键方法规则

1. 线索问题只在参与者完成分界点和不确定范围后出现，避免选项先行诱导边界。
2. 每步必须至少选择一个选项。
3. 各披露步骤中的“没有改变我的判断”是互斥选项，不能与其他项目同时选择。
4. GI/DI 项目询问的是本步新增信息如何参与判断，不要求参与者重复报告所有此前线索。
5. DI2 的“上线时间、用途、机制”是面向加密资产语境的项目特定操作化。相关文献直接支持的是“领域知识会改变注意、编码与推断”这一上位机制，而不是这三个中文项目已经构成验证量表。
6. 正式采集后冻结中文措辞与代码。任何改动都必须升级 schemaVersion，并保留旧 JSON，以保证数据可重现。

机器可读的完整标签—文献映射见 `public/data/cue-taxonomy-v4-v2.json`。旧版 `public/data/cue-taxonomy-v4.json` 保留，仅用于历史会话复现。

## 4. Reference 清单

- **R1** Tsai, E. H.-I., Hahn, Y., & Siegler, R. S. (2026). *The Pictorial–Semantic–Task Framework for Understanding Graph Comprehension*. Journal of Intelligence, 14(2), 28. https://doi.org/10.3390/jintelligence14020028
- **R2** Fudolig, M. A., Robinson, E. A., & VanderPlas, S. (2025). *Can You See The Change? Change Point Detection Using Visual Inference*. Journal of Computational and Graphical Statistics, 34, 1705–1716. https://doi.org/10.1080/10618600.2025.2485278
- **R3** Ciccione, L., Sablé-Meyer, M., Boissin, E., et al. (2023). *Trend judgment as a perceptual building block of graphicacy and mathematics, across age, education, and culture*. Scientific Reports, 13, 10266. https://doi.org/10.1038/s41598-023-37172-3
- **R4** Nguyen, T. T., Etzel, J. A., Bezdek, M. A., & Zacks, J. M. (2026). *Multiple event segmentation mechanisms in the human brain*. eLife, 14, RP107955. https://doi.org/10.7554/eLife.107955.3
- **R5** Pauly, R., & Schwan, S. (2024). *How Do People Parse Dynamic Maps? Insights from Event Segmentation Experiments*. LIPIcs COSIT 2024, Article 14. https://doi.org/10.4230/LIPIcs.COSIT.2024.14
- **R6** Shah, P., & Freedman, E. G. (2011). *Bar and Line Graph Comprehension: An Interaction of Top-Down and Bottom-Up Processes*. Topics in Cognitive Science, 3, 560–578. https://doi.org/10.1111/j.1756-8765.2009.01066.x
- **R7** Canham, M., & Hegarty, M. (2010). *Effects of knowledge and display design on comprehension of complex graphics*. Learning and Instruction, 20(2), 155–166. https://doi.org/10.1016/j.learninstruc.2009.02.014
- **R8** Berg, S. A., & Moon, A. (2023). *A characterization of chemistry learners’ engagement in data analysis and interpretation*. Chemistry Education Research and Practice, 24, 36–49. https://doi.org/10.1039/D2RP00154C
- **R9** Ryan, W. H., & Evers, E. R. K. (2020). *Graphs with logarithmic axes distort lay judgments*. Behavioral Science & Policy, 6(2), 13–23. https://doi.org/10.1177/237946152000600203
- **R10** Melnik-Leroy, G. A., Aidokas, L., Dzemyda, G., Dzemydaitė, G., Marcinkevičius, V., Tiešis, V., & Usovaitė, A. (2023). *Is my visualization better than yours? Analyzing factors modulating exponential growth bias in graphs*. Frontiers in Psychology, 14, 1125810. https://doi.org/10.3389/fpsyg.2023.1125810
