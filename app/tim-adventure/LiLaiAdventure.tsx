"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { advancePower, isSuccessfulLanding, jumpChapters as chapters, starsForMisses } from "./jumpEngine";

type Screen = "cover" | "journey" | "complete";

type Failure = {
  school: string;
};

const avatars = {
  middle: {
    src: "/tim-adventure/tim-middle-school.png",
    alt: "穿蓝白中学校服、背着书包并站在地图左下角的少年 Tim",
    label: "中学生 Tim",
  },
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
  if (landedCount === 2) return avatars.princeton;
  if (landedCount === 1) return avatars.pku;
  return avatars.middle;
}

export function LiLaiAdventure() {
  const [screen, setScreen] = useState<Screen>("cover");
  const [landedCount, setLandedCount] = useState(0);
  const [power, setPower] = useState(0);
  const [charging, setCharging] = useState(false);
  const [isJumping, setIsJumping] = useState(false);
  const [feedback, setFeedback] = useState("按住蓄力，满格后会从零重新循环");
  const [misses, setMisses] = useState(0);
  const [failure, setFailure] = useState<Failure | null>(null);

  const powerRef = useRef(power);
  const chargingRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  const previousFrameRef = useRef<number | null>(null);
  const landingTimerRef = useRef<number | null>(null);
  const failureButtonRef = useRef<HTMLButtonElement | null>(null);

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

  useEffect(() => {
    if (failure) failureButtonRef.current?.focus();
  }, [failure]);

  const animatePower = useCallback(() => {
    stopPowerAnimation();
    const speed = chapters[Math.min(landedCount, chapters.length - 1)].speed;

    const tick = (time: number) => {
      const previous = previousFrameRef.current ?? time;
      const delta = Math.min(32, time - previous);
      previousFrameRef.current = time;

      const { power: next, wrapped } = advancePower(powerRef.current, delta, speed);
      powerRef.current = next;
      setPower(next);
      if (wrapped) setFeedback("满格归零——重新瞄准绿色区域！");
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
  }, [landedCount, stopPowerAnimation]);

  const startCharge = useCallback(() => {
    if (chargingRef.current || failure || isJumping || screen !== "journey" || landedCount >= chapters.length) return;
    chargingRef.current = true;
    setCharging(true);
    setFeedback("绿色落点很窄——看准后立刻松手！");
    animatePower();
  }, [animatePower, failure, isJumping, landedCount, screen]);

  const releaseJump = useCallback(() => {
    if (!chargingRef.current || failure || isJumping || screen !== "journey" || landedCount >= chapters.length) return;

    chargingRef.current = false;
    setCharging(false);
    stopPowerAnimation();

    const target = chapters[landedCount];
    const landed = isSuccessfulLanding(powerRef.current, target);
    if (!landed) {
      setMisses((value) => value + 1);
      setPower(0);
      powerRef.current = 0;
      setFailure({
        school: target.school,
      });
      return;
    }

    const nextLandedCount = landedCount + 1;
    setIsJumping(true);
    setFeedback(`起跳！正在跃向${target.school}`);
    clearLandingTimer();
    landingTimerRef.current = window.setTimeout(() => {
      setLandedCount(nextLandedCount);
      setIsJumping(false);
      setPower(0);
      powerRef.current = 0;

      if (nextLandedCount === chapters.length) {
        setFeedback("三跃完成：从中学校园抵达 MIT 穹顶");
        landingTimerRef.current = window.setTimeout(() => setScreen("complete"), 780);
        return;
      }

      const nextTarget = chapters[nextLandedCount];
      setFeedback(`下一站：${nextTarget.school}。速度更快，绿色区更窄。`);
    }, 560);
  }, [clearLandingTimer, failure, isJumping, landedCount, screen, stopPowerAnimation]);

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

  const resetJourney = useCallback((resetMisses: boolean) => {
    stopPowerAnimation();
    clearLandingTimer();
    chargingRef.current = false;
    powerRef.current = 0;
    setPower(0);
    setCharging(false);
    setIsJumping(false);
    setLandedCount(0);
    if (resetMisses) setMisses(0);
    setFailure(null);
    setFeedback("按住蓄力，满格后会从零重新循环");
    setScreen("journey");
  }, [clearLandingTimer, stopPowerAnimation]);

  const begin = useCallback(() => resetJourney(true), [resetJourney]);
  const restartAfterFailure = useCallback(() => resetJourney(false), [resetJourney]);

  const displayStep = Math.min(landedCount + (isJumping ? 1 : 0), chapters.length);
  const avatar = avatarForProgress(landedCount);
  const currentTarget = chapters[Math.min(landedCount, chapters.length - 1)];
  const earnedStars = useMemo(() => starsForMisses(misses), [misses]);

  return (
    <main className="lai-shell">
      <section className={`lai-game lai-screen-${screen}`} aria-label="李来历险记：人生三跃">
        {screen === "cover" && (
          <div className="lai-cover">
            <div className="lai-cover-world" aria-hidden="true">
              <Image src="/tim-adventure/cover-sunset-campus.webp" alt="" fill priority sizes="(max-width: 480px) 100vw, 480px" />
            </div>
            <div className="lai-cover-copy">
              <h1>李来历险记</h1>
              <p>劝君惜取金缕衣，劝君惜取少年时</p>
            </div>
            <button className="lai-primary" type="button" onClick={begin}>一路向前！</button>
          </div>
        )}

        {screen === "journey" && (
          <div className="lai-journey-screen">
            <div className="lai-journey-stage">
              <div className="lai-journey-world" aria-hidden="true">
                <Image src="/tim-adventure/journey-campuses.webp" alt="" fill priority sizes="(max-width: 480px) 100vw, 480px" />
              </div>
              <a className="lai-corner-back" href="/tim-classroom" aria-label="返回 Tim 小课堂">←</a>
              <Image
                key={avatar.src}
                className={`lai-life-avatar lai-life-step-${displayStep} ${isJumping ? "is-jumping" : ""}`}
                src={avatar.src}
                alt={avatar.alt}
                width={512}
                height={768}
                sizes="112px"
              />
            </div>

            <div className="lai-jump-console">
              <div className="lai-target-row">
                <span><small>{landedCount + 1} / 3 · {currentTarget.chapter}</small><b>{currentTarget.school}</b></span>
                <em>储能 {currentTarget.speedLabel}</em>
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
                <small>满格归零 · 也可按住空格键</small>
              </button>
            </div>
          </div>
        )}

        {failure && screen === "journey" && (
          <div className="lai-failure-overlay">
            <section className="lai-failure-dialog" role="dialog" aria-modal="true" aria-labelledby="lai-failure-title">
              <span>MISS · {failure.school}</span>
              <h2 id="lai-failure-title">不破不立！<br />屡败屡战！</h2>
              <p>收拾行装，重整旗鼓</p>
              <button ref={failureButtonRef} className="lai-primary" type="button" onClick={restartAfterFailure}>继续向前！</button>
            </section>
          </div>
        )}

        {screen === "complete" && (
          <div className="lai-complete">
            <div className="lai-journey-world" aria-hidden="true">
              <Image src="/tim-adventure/journey-campuses.webp" alt="" fill sizes="(max-width: 480px) 100vw, 480px" />
            </div>
            <Image className="lai-complete-avatar" src={avatars.mit.src} alt={avatars.mit.alt} width={512} height={768} sizes="190px" />
            <div className="lai-complete-panel">
              <p>THREE LEAPS CLEARED</p>
              <h2>人生三跃完成</h2>
              <div className="lai-complete-stars" aria-label={`${earnedStars} 星成绩`}>
                {"★".repeat(earnedStars)}{"☆".repeat(3 - earnedStars)}
              </div>
              <span>中学校园 <i>→</i> 北大 <i>→</i> 普林斯顿 <i>→</i> MIT</span>
              <small>我会一直往前。全程重新出发 {misses} 次。</small>
              <button className="lai-primary" type="button" onClick={begin}>再走一次</button>
              <a className="lai-secondary" href="/tim-classroom">返回 Tim 小课堂</a>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
