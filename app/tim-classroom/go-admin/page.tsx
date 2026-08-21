import { env } from "cloudflare:workers";

import { chatGPTSignOutPath, requireChatGPTUser } from "@/app/chatgpt-auth";
import { ensureGoSchema, getD1 } from "@/db";

import "./go-admin.css";

export const dynamic = "force-dynamic";

type Summary = {
  learners: number;
  attempts: number;
  games: number;
  certificates: number;
};

function allowedEmails() {
  const value = (env as Cloudflare.Env & { RESEARCHER_EMAILS?: string }).RESEARCHER_EMAILS ?? "";
  return new Set(value.split(/[;,\s]+/).map((email) => email.trim().toLowerCase()).filter(Boolean));
}

async function GoAdminDashboard() {
  const user = await requireChatGPTUser("/tim-classroom/go-admin");
  if (!allowedEmails().has(user.email.toLowerCase())) {
    return (
      <main className="go-admin-shell">
        <section className="go-admin-card go-admin-denied">
          <small>TIM GO ADMIN</small>
          <h1>这个账号没有查看权限</h1>
          <p>当前登录为 {user.email}。围棋学习者昵称与明细只对管理员白名单开放。</p>
          <a href={chatGPTSignOutPath("/tim-classroom/go-admin")}>切换 ChatGPT 账号</a>
          <a href="/tim-classroom">返回 Tim小课堂</a>
        </section>
      </main>
    );
  }

  await ensureGoSchema();
  const d1 = getD1();
  const [summary, levels, opponents, recent] = await Promise.all([
    d1.prepare(`SELECT
      (SELECT COUNT(*) FROM go_learners) AS learners,
      (SELECT COUNT(*) FROM go_attempts) AS attempts,
      (SELECT COUNT(*) FROM go_games) AS games,
      (SELECT COUNT(DISTINCT certificate_id) FROM go_attempts) AS certificates`).first<Summary>(),
    d1.prepare(`SELECT level, COUNT(*) AS attempts,
      ROUND(AVG(score * 100.0 / total), 1) AS averageScore,
      MAX(score * 100 / total) AS bestScore
      FROM go_attempts GROUP BY level ORDER BY level`).all<{ level: number; attempts: number; averageScore: number; bestScore: number }>(),
    d1.prepare(`SELECT opponent_id AS opponentId, COUNT(*) AS games,
      SUM(CASE WHEN result = 'player_win' THEN 1 ELSE 0 END) AS playerWins
      FROM go_games GROUP BY opponent_id ORDER BY games DESC`).all<{ opponentId: string; games: number; playerWins: number }>(),
    d1.prepare(`SELECT a.created_at AS createdAt, l.nickname, a.level, a.mode,
      a.score, a.total, a.certificate_id AS certificateId
      FROM go_attempts a JOIN go_learners l ON l.id = a.learner_id
      ORDER BY a.created_at DESC LIMIT 30`).all<{ createdAt: string; nickname: string; level: number; mode: string; score: number; total: number; certificateId: string }>(),
  ]);

  const opponentNames: Record<string, string> = {
    normal: "古风弈士 Tim",
    hero: "暴衣好汉 Tim",
    emperor: "皇帝 Tim",
    saiyan: "赛亚人 Tim",
  };

  return (
    <main className="go-admin-shell">
      <section className="go-admin-card">
        <header className="go-admin-header">
          <div><small>TIM GO · PRIVATE ADMIN</small><h1>围棋学习数据</h1><p>已登录：{user.displayName}</p></div>
          <nav><a href="/tim-classroom">打开课堂</a><a href={chatGPTSignOutPath("/tim-classroom/go-admin")}>退出</a></nav>
        </header>

        <div className="go-admin-summary">
          <article><small>学习者</small><strong>{summary?.learners ?? 0}</strong></article>
          <article><small>答题轮次</small><strong>{summary?.attempts ?? 0}</strong></article>
          <article><small>对弈盘数</small><strong>{summary?.games ?? 0}</strong></article>
          <article><small>证书记录</small><strong>{summary?.certificates ?? 0}</strong></article>
        </div>

        <section className="go-admin-section">
          <div className="go-admin-section-title"><h2>十级学习表现</h2><span>按完成轮次聚合</span></div>
          <div className="go-admin-levels">
            {Array.from({ length: 10 }, (_, index) => {
              const level = index + 1;
              const item = levels.results.find((row) => row.level === level);
              return <article key={level}><span>{String(level).padStart(2, "0")}</span><div><strong>第 {level} 级</strong><small>{item?.attempts ?? 0} 次练习</small></div><b>{item ? `${item.averageScore}%` : "—"}</b></article>;
            })}
          </div>
        </section>

        <section className="go-admin-section">
          <div className="go-admin-section-title"><h2>Boss 对弈</h2><span>玩家胜局 / 总盘数</span></div>
          <div className="go-admin-opponents">
            {opponents.results.length ? opponents.results.map((item) => <article key={item.opponentId}><strong>{opponentNames[item.opponentId] ?? item.opponentId}</strong><span>{item.playerWins} / {item.games}</span></article>) : <p>还没有完成的对弈记录。</p>}
          </div>
        </section>

        <section className="go-admin-section">
          <div className="go-admin-section-title"><h2>最近练习</h2><span>最近 30 条</span></div>
          <div className="go-admin-table-wrap"><table><thead><tr><th>时间</th><th>昵称</th><th>级别</th><th>模式</th><th>成绩</th><th>证书</th></tr></thead><tbody>{recent.results.map((item) => <tr key={item.certificateId}><td>{new Date(item.createdAt).toLocaleString("zh-CN")}</td><td>{item.nickname}</td><td>第 {item.level} 级</td><td>{item.mode === "retry" ? "错题重练" : "随机练习"}</td><td>{item.score}/{item.total}</td><td>{item.certificateId}</td></tr>)}</tbody></table></div>
        </section>
      </section>
    </main>
  );
}

export default function GoAdminPage() {
  return <GoAdminDashboard />;
}
