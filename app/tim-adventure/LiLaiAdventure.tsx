"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

type Screen = "cover" | "journey" | "complete";

type Chapter = {
  id: "pku" | "princeton" | "mit";
  short: string;
  school: string;
  english: string;
  chapter: string;
  story: string;
  min: number;
  max: number;
};

const chapters: Chapter[] = [
  {
    id: "pku",
    short: "PKU",
    school: "北京大学",
    english: "PEKING UNIVERSITY",
    chapter: "青春开场",
    story: "穿上 TIM 1 号球衣，从未名湖畔起跳",
    min: 36,
    max: 54,
  },
  {
    id: "princeton",
    short: "P",
    school: "普林斯顿",
    english: "PRINCETON UNIVERSITY",
    chapter: "跨洋求学",
    story: "背起行囊，跃向橙黑色的秋日校园",
    min: 58,
    max: 72,
  },
  {
    id: "mit",
    short: "MIT",
    school: "MIT",
    english: "MASSACHUSETTS INSTITUTE OF TECHNOLOGY",
    chapter: "学术远征",
    story: "披上学术长袍，抵达穹顶之上的新起点",
    min: 76,
    max: 89,
  },
];

const avatars = {
  pku: {
    src: "/tim-adventure/tim-pku-basketball.png",
    alt: "背对镜头、穿 TIM 1 号北大篮球服的青春 Tim",
    label: "北大篮球 Tim",
  },
  princeton: {
    src: "/tim-adventure/tim-princeton-student.png",
    alt: "背对镜头、带普林斯顿盾徽并背着行囊的学生 Tim",
    label: "普林斯顿 Tim",
  },
  mit: {
    src: "/tim-adventure/tim-mit-scholar.png",
    alt: "背对镜头、披着 MIT 学术长袍与披风的 Tim",
    label: "MIT 学者 Tim",
  },
};

function avatarForProgress(landedCount: number) {
  if (landedCount >= 3) return avatars.mit;
  if (landedCount >= 2) return avatars.princeton;
  return avatars.pku;
}

function starsForMisses(misses: number) {
  if (misses === 0) return 3;
  if (misses <= 2) return 2;
  return 1;
}

export function LiLaiAdventure() {
  const [screen, setScreen] = useState<Screen>("cover");
  const [landedCount, setLandedCount] = useState(0);
  const [power, setPower] = useState(8);
  const [charging, setCharging] = useState(false);
  const [isJumping, setIsJumping] = useState(false);
  const [feedback, setFeedback] = useState("按住蓄力，松手跃向北大");
  const [misses, setMisses] = useState(0);

  const powerRef = useRef(power);
  const chargingRef = useRef(false);
  const directionRef = useRef(1);
  const frameRef = useRef<number | null>(null);
  const previousFrameRef = useRef<number | null>(null);
  const landingTimerRef = useRef<number | null>(null);

  const stopPowerAnimation = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    previousFrameRef.current = null;
  }, []);

  const clearLandingTimer = useCallback(() => {
    if (landingTimerRef.current !== null) window.clearTimeout(landingTimerRef.current);
    landingTimerRef.current = null;
  }, []);

  useEffect(() => {
    powerRef.current = power;
  }, [power]);

  useEffect(
    () => () => {
      stopPowerAnimation();
      clearLandingTimer();
    },
    [clearLandingTimer, stopPowerAnimation],
  );

  const animatePower = useCallback(() => {
    stopPowerAnimation();
    const tick = (time: number) => {
      const previous = previousFrameRef.current ?? time;
      const delta = Math.min(32, time - previous);
      previousFrameRef.current = time;

      let next = powerRef.current + directionRef.current * delta * 0.085;
      if (next >= 100) {
        next = 100;
        directionRef.current = -1;
      } else if (next <= 3) {
        next = 3;
        directionRef.current = 1;
      }

      powerRef.current = next;
      setPower(next);
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  }, [stopPowerAnimation]);

  const startCharge = useCallback(() => {
    if (chargingRef.current || isJumping || screen !== "journey" || landedCount >= chapters.length) return;
    chargingRef.current = true;
    setCharging(true);
    setFeedback("看准绿色落点——松手起跳！");
    animatePower();
  }, [animatePower, isJumping, landedCount, screen]);

  const releaseJump = useCallback(() => {
    if (!chargingRef.current || isJumping || screen !== "journey" || landedCount >= chapters.length) return;

    chargingRef.current = false;
    setCharging(false);
    stopPowerAnimation();

    const target = chapters[landedCount];
    const landed = powerRef.current >= target.min && powerRef.current <= target.max;
    if (!landed) {
      setMisses((value) => value + 1);
      setFeedback(
        powerRef.current < target.min
          ? `还差一点！再多蓄力，才能抵达${target.school}`
          : `飞过头啦！早点松手，重新瞄准${target.school}`,
      );
      return;
    }

    const nextLandedCount = landedCount + 1;
    setIsJumping(true);
    setFeedback(`起跳！正在越过「${target.chapter}」`);
    clearLandingTimer();
    landingTimerRef.current = window.setTimeout(() => {
      setLandedCount(nextLandedCount);
      setIsJumping(false);
      setPower(8);
      powerRef.current = 8;
      directionRef.current = 1;

      if (nextLandedCount === chapters.length) {
        setFeedback("三跃完成：从未名湖畔抵达 MIT 穹顶");
        landingTimerRef.current = window.setTimeout(() => setScreen("complete"), 900);
        return;
      }

      const nextTarget = chapters[nextLandedCount];
      setFeedback(`稳稳落地！下一站：${nextTarget.school}`);
    }, 560);
  }, [clearLandingTimer, isJumping, landedCount, screen, stopPowerAnimation]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) return;
      event.preventDefault();
      startCharge();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      event.preventDefault();
      releaseJump();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [releaseJump, startCharge]);

  const begin = useCallback(() => {
    stopPowerAnimation();
    clearLandingTimer();
    chargingRef.current = false;
    directionRef.current = 1;
    powerRef.current = 8;
    setPower(8);
    setCharging(false);
    setIsJumping(false);
    setLandedCount(0);
    setMisses(0);
    setFeedback("按住蓄力，松手跃向北大");
    setScreen("journey");
  }, [clearLandingTimer, stopPowerAnimation]);

  const displayStep = Math.min(landedCount + (isJumping ? 1 : 0), chapters.length);
  const avatar = avatarForProgress(landedCount);
  const currentTarget = chapters[Math.min(landedCount, chapters.length - 1)];
  const earnedStars = useMemo(() => starsForMisses(misses), [misses]);

  return (
    <main className="lai-shell">
      <section className={`lai-game lai-screen-${screen}`} aria-label="李来历险记：人生三跃">
        <div className="lai-journey-world" aria-hidden="true">
          <Image src="/tim-adventure/journey-campuses.webp" alt="" fill priority sizes="(max-width: 480px) 100vw, 480px" />
        </div>

        <header className="lai-topbar">
          <a href="/tim-classroom" aria-label="返回 Tim 小课堂">←</a>
          <div>
            <small>TIM LIFE JOURNEY</small>
            <strong>李来历险记</strong>
          </div>
          <span aria-hidden="true">↟</span>
        </header>

        {screen === "cover" && (
          <div className="lai-cover">
            <div className="lai-cover-copy">
              <p>像素人生 · 一页三校</p>
              <h1>人生<br /><em>三跃</em></h1>
              <span>从北大到普林斯顿，再跃向 MIT</span>
            </div>

            <div className="lai-cover-route" aria-label="学习轨迹">
              {chapters.map((chapter, index) => (
                <div key={chapter.id}>
                  <i>{index + 1}</i>
                  <span><b>{chapter.school}</b><small>{chapter.chapter}</small></span>
                </div>
              ))}
            </div>

            <Image className="lai-cover-avatar" src={avatars.pku.src} alt={avatars.pku.alt} width={512} height={768} priority sizes="188px" />
            <button className="lai-primary" type="button" onClick={begin}>
              开始人生三跃 <span>↑</span>
            </button>
          </div>
        )}

        {screen === "journey" && (
          <div className="lai-journey-screen">
            <div className="lai-level-head">
              <span>第一关 · 蓄力跳格子</span>
              <strong>{currentTarget.school} · {currentTarget.chapter}</strong>
              <small>{currentTarget.story}</small>
            </div>

            <div className="lai-campus-markers" aria-label="北大、普林斯顿与 MIT 三段学习轨迹">
              {chapters.map((chapter, index) => {
                const state = index < landedCount ? "is-done" : index === landedCount ? "is-current" : "is-locked";
                return (
                  <div key={chapter.id} className={`lai-campus-marker lai-marker-${chapter.id} ${state}`}>
                    <i>{index < landedCount ? "✓" : chapter.short}</i>
                    <span><b>{chapter.school}</b><small>{chapter.english}</small></span>
                  </div>
                );
              })}
            </div>

            <div className="lai-spark-trail" aria-hidden="true"><i /><i /><i /><i /></div>
            <Image
              key={avatar.src}
              className={`lai-life-avatar lai-life-step-${displayStep} ${isJumping ? "is-jumping" : ""}`}
              src={avatar.src}
              alt={avatar.alt}
              width={512}
              height={768}
              sizes="112px"
            />

            <div className="lai-jump-console">
              <div className="lai-target-row">
                <span><small>当前目标</small><b>{currentTarget.school}</b></span>
                <em>{landedCount + 1} / 3</em>
              </div>
              <div className="lai-power-row"><span>蓄力值</span><b>{Math.round(power)}%</b></div>
              <div className="lai-power-track" aria-label={`当前蓄力 ${Math.round(power)}%`}>
                <i style={{ left: `${currentTarget.min}%`, width: `${currentTarget.max - currentTarget.min}%` }} />
                <span style={{ width: `${power}%` }} />
              </div>
              <p className={charging ? "is-charging" : ""} aria-live="polite">{feedback}</p>
              <button
                className={`lai-charge ${charging ? "is-charging" : ""}`}
                type="button"
                disabled={isJumping}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  startCharge();
                }}
                onPointerUp={releaseJump}
                onPointerCancel={releaseJump}
                onContextMenu={(event) => event.preventDefault()}
              >
                <span aria-hidden="true">{isJumping ? "✦" : charging ? "⚡" : "👟"}</span>
                <b>{isJumping ? "跃迁中…" : charging ? "松手起跳" : "按住蓄力"}</b>
                <small>也可按住空格键</small>
              </button>
              <div className="lai-miss-count">{avatar.label} · 失误 {misses} 次 · 可无限重试</div>
            </div>
          </div>
        )}

        {screen === "complete" && (
          <div className="lai-complete">
            <Image className="lai-complete-avatar" src={avatars.mit.src} alt={avatars.mit.alt} width={512} height={768} sizes="190px" />
            <div className="lai-complete-panel">
              <p>THREE LEAPS CLEARED</p>
              <h2>人生三跃完成</h2>
              <div className="lai-complete-stars" aria-label={`${earnedStars} 星成绩`}>
                {"★".repeat(earnedStars)}{"☆".repeat(3 - earnedStars)}
              </div>
              <span>北大球场 <i>→</i> 普林斯顿 <i>→</i> MIT 穹顶</span>
              <small>每一次蓄力，都是下一段学习经历的起点。全程失误 {misses} 次。</small>
              <button className="lai-primary" type="button" onClick={begin}>再走一次 <span>↻</span></button>
              <a className="lai-secondary" href="/tim-classroom">返回 Tim 小课堂</a>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
