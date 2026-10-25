'use client';
/**
 * The Today composition for the frames gate (02 section 16.1). Uses only shared components; it is the
 * visual reference U1 and U2 build Today from (same components, same order, same props shape).
 */
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { SetupLink } from '@/components/SetupLink';
import {
  ActionPill, Aurora, BandViz, CapViz, Glass, GlassBudgetProvider, HeroPair, NarrativeCard, PeriodScrubber, PlusButton,
  RoundButton, SearchPill, Segmented, Sheet, Tile, TileRow,
} from '@/components/lab/v2/shared';
import type { FrameState, FrameToday } from '@/lib/lab/view/frames';

/** Remembers the data-lab-shared id of the element the viewer last clicked, so a sheet knows its origin. */
function useLastOrigin() {
  const last = useRef<string | null>(null);
  useEffect(() => {
    const on = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.('[data-lab-shared]');
      last.current = el?.getAttribute('data-lab-shared') ?? null;
    };
    document.addEventListener('click', on, true);
    return () => document.removeEventListener('click', on, true);
  }, []);
  return last;
}

function Header({ data }: { data: FrameToday }) {
  return (
    <header className="lab2-head">
      <span className="lab2-back" data-lab-ink="">Content Lab</span>
      <nav className="lab2-tabs" aria-label="Content Lab pages">
        {data.tabs.map((t) =>
          t.active ? (
            <Link key={t.id} href={t.href} className="lab2-tab" aria-current="page" data-lab-ink="">
              <h1 style={{ font: 'inherit' }}>{t.label}</h1>
            </Link>
          ) : (
            <Link key={t.id} href={t.href} className="lab2-tab" data-lab-ink="">{t.label}</Link>
          ),
        )}
      </nav>
      <div className="lab2-head-tools">
        {!data.notConfigured && <span className="lab2-chip lab2-hide-phone" data-sample-badge="" data-lab-ink="">Sample data</span>}
        <SearchPill placeholder="Ask the Lab" />
        <RoundButton label="Setup" icon="menu" href={data.notConfigured ? '?setup=keys' : '?setup=checklist'} sharedId="setup-menu" />
      </div>
    </header>
  );
}

function Actions({ data }: { data: FrameToday }) {
  return (
    <div className="lab2-today-actions lab2-actions">
      {data.quickActions.map((a) => (
        <span key={a.label} className={a.label === 'Run now' ? undefined : 'lab2-hide-phone'}>
          <ActionPill {...a} />
        </span>
      ))}
      <PlusButton label="Create" items={data.createMenu} />
    </div>
  );
}

function PostSheetBody({ data }: { data: FrameToday }) {
  const s = data.postSheet;
  return (
    <div className="lab2-postsheet">
      <p className="lab2-postsheet-hook" data-lab-ink="">{s.hook}</p>
      <div className="lab2-stats">
        <span className="lab2-stat">
          <span className="lab2-stat-num" data-lab-ink="">{s.readText.replace(/x$/, '')}<sup>x</sup></span>
          <span className="lab2-stat-label" data-lab-ink="">at 24h, {s.nText}</span>
        </span>
        <span className="lab2-stat">
          <span className="lab2-stat-label" data-lab-ink="">Range</span>
          <span className="lab2-card-text" data-lab-ink="">{s.rangeText}</span>
        </span>
      </div>
      {s.viz?.kind === 'band' && <BandViz ageH={s.viz.ageH} points={s.viz.points} band={s.viz.band} w={500} h={120} />}
      <div className="lab2-postsheet-reads">
        <span className="lab2-card-cap" data-lab-ink="">Read at</span>
        {s.reads.map((r) => <span key={r} className="lab2-chip" data-lab-ink="">{r}</span>)}
      </div>
      <div className="lab2-stat">
        <span className="lab2-stat-label" data-lab-ink="">Why it may have worked</span>
        <p className="lab2-card-text" data-lab-ink="">{s.why}</p>
      </div>
    </div>
  );
}

export function FrameTodayView({ state, data }: { state: Exclude<FrameState, 'components'>; data: FrameToday }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const lastOrigin = useLastOrigin();
  const [seg, setSeg] = useState<'brief' | 'ask'>('brief');
  const [period, setPeriod] = useState(data.periods[data.periods.length - 1].id);
  const post = params.get('post');
  const open = !!post && !data.notConfigured;
  // Read at render: the click that pushed ?post= set it, a deep link leaves it null (fade path, 03.12.3).
  const originId = open ? lastOrigin.current : null;
  const close = () => router.push(pathname, { scroll: false });

  return (
    <div className="lab lab-v2" data-lab-root="" data-lab-frame={state}>
      <Aurora />
      <GlassBudgetProvider>
        <div className="lab2-page">
          <Header data={data} />
          {data.notConfigured ? (
            <>
              <div className="lab2-today-top" style={{ gridTemplateAreas: "'actions actions' 'heroes heroes'" }}>
                <Actions data={data} />
                <div className="lab2-today-heroes">
                  <Glass tone="strong" radius="narrative" priority={2} className="lab2-empty" data-lab-empty="">
                    <h2 className="lab2-empty-title" data-lab-ink="">Content Lab needs an Apify key</h2>
                    <p className="lab2-empty-text" data-lab-ink="">
                      It reads public posts from your accounts and the creators you track through Apify. Paste a key in Setup to start.
                    </p>
                    <span className="lab2-empty-actions">
                      <SetupLink href="?setup=keys" label="Set up" className="lab2-setup" />
                      <Link href="?sample=1" className="lab2-textlink" data-lab-ink="">Preview with sample data</Link>
                    </span>
                  </Glass>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="lab2-today-top">
                <Actions data={data} />
                <div className="lab2-today-heroes">
                  <HeroPair pages={[{ id: 'all', label: 'All platforms', heroes: data.heroes }]} />
                </div>
                <div className="lab2-today-cards">
                  <NarrativeCard {...data.brief} paused={open} />
                  <NarrativeCard {...data.window} paused={open} />
                </div>
              </div>

              <div className="lab2-today-bar">
                <Segmented
                  label="Today view"
                  options={data.segmented}
                  value={seg}
                  onChange={setSeg}
                  controls="lab2-today-lower"
                />
                <PeriodScrubber periods={data.periods} value={period} onChange={setPeriod} label="Period for the sections below" />
              </div>

              <div id="lab2-today-lower" role="tabpanel">
                {seg === 'ask' ? (
                  <Glass tone="strong" radius="narrative" priority={2} className="lab2-empty" style={{ marginTop: 36 }}>
                    <h2 className="lab2-empty-title" data-lab-ink="">Ask the Lab</h2>
                    <p className="lab2-empty-text" data-lab-ink="">Ask a question about your niche. The answer cards are drawn by the Studio lanes.</p>
                  </Glass>
                ) : (
                  <>
                    <div className="lab2-today-rows">
                      <TileRow id="your-posts" title="Your posts" description="Judged at their age, against your normal" seeAllHref="/lab/breakouts?mine=1&window=30">
                        {data.yourPosts.map((t) => <Tile key={t.id} {...t} />)}
                      </TileRow>
                      <TileRow id="launch-radar" title="Launch radar" description="Events with an open window" seeAllHref="/lab/radar">
                        {data.launchRadar.map((t) => <Tile key={t.id} {...t} />)}
                      </TileRow>
                    </div>

                    <section className="lab2-today-section" aria-labelledby="next-title">
                      <header className="lab2-row-head">
                        <span className="lab2-row-text">
                          <h2 id="next-title" className="lab2-row-title" data-lab-ink="">Next to make</h2>
                          <span className="lab2-row-desc" data-lab-ink="">Open ideas, launches with an open window first</span>
                        </span>
                        <Link href="/lab/studio" className="lab2-pill lab2-seeall" data-lab-ink="">All ideas</Link>
                      </header>
                      <div className="lab2-list">
                        {data.nextToMake.map((r) => (
                          <Glass key={r.id} tone="strong" radius="chip" priority={3} className="lab2-listrow">
                            <span className="lab2-listrow-title" data-lab-ink="">{r.title}</span>
                            <span className="lab2-listrow-meta" data-lab-ink="">{r.windowText}</span>
                            <span className="lab2-listrow-meta" data-lab-ink="">{r.groundedText}</span>
                            <ActionPill {...r.action} />
                          </Glass>
                        ))}
                      </div>
                    </section>

                    <div className="lab2-today-foot">
                      <Glass as="section" tone="strong" radius="tile" priority={3} className="lab2-card" aria-labelledby="pipe-title">
                        <header className="lab2-card-head">
                          <h2 id="pipe-title" className="lab2-card-title" data-lab-ink="">Pipeline</h2>
                          <Link href="?setup=spend" className="lab2-pill lab2-seeall" data-lab-ink="" data-lab-shared="pipeline">Spend and runs</Link>
                        </header>
                        <div className="lab2-stats">
                          {data.pipeline.stats.map((s) => (
                            <span key={s.id} className="lab2-stat">
                              <span className="lab2-stat-num" data-lab-ink="">{s.valueText}</span>
                              <span className="lab2-stat-label" data-lab-ink="">{s.label}</span>
                            </span>
                          ))}
                          <span className="lab2-stat">
                            <span className="lab2-stat-cap">
                              <span className="lab2-stat-num" data-lab-ink=""><sup style={{ marginLeft: 0, marginRight: 2 }}>$</sup>{data.pipeline.spend.text}</span>
                              <CapViz spent={data.pipeline.spend.spent} cap={data.pipeline.spend.cap} />
                            </span>
                            <span className="lab2-stat-label" data-lab-ink="">Spend, {data.pipeline.spend.foot}</span>
                          </span>
                        </div>
                        <span className="lab2-card-cap" data-lab-ink="">{data.pipeline.lastRunText}</span>
                      </Glass>
                      <Glass as="section" tone="strong" radius="tile" priority={3} className="lab2-card" aria-labelledby="ledger-title">
                        <header className="lab2-card-head">
                          <h2 id="ledger-title" className="lab2-card-title" data-lab-ink="">Ledger</h2>
                          <Link href="/lab/ledger" className="lab2-pill lab2-seeall" data-lab-ink="">Open ledger</Link>
                        </header>
                        <p className="lab2-card-text" data-lab-ink="">{data.ledgerLine}</p>
                        <span className="lab2-card-cap" data-lab-ink="">Every prediction is frozen before posting and graded at 7 days.</span>
                      </Glass>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
        <Sheet kind="post" open={open} onClose={close} originId={originId} title={data.postSheet.title} caption={data.postSheet.caption}>
          <PostSheetBody data={data} />
        </Sheet>
      </GlassBudgetProvider>
    </div>
  );
}
