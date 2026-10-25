'use client';
/**
 * The components specimen board (02 section 16.1, state `components`): every shared component in every
 * state from sections 4 to 13, labelled, on the Aurora. Fictional sample values only.
 */
import type { ReactNode } from 'react';
import {
  ActionPill, ArrowButton, Aurora, CostFitBar, DotMatrix, Glass, GlassBudgetProvider, HeroMetric, NarrativeCard, PeriodScrubber,
  PlusButton, ProgressRow, RoundButton, SearchPill, Segmented, StageList, Tile, type HeroMetricProps, type TileProps,
} from '@/components/lab/v2/shared';
import { frameToday } from '@/lib/lab/view/frames';

function Spec({ name, children, wide }: { name: string; children: ReactNode; wide?: boolean }) {
  return (
    <figure className="lab2-spec" data-wide={wide ? '' : undefined}>
      <figcaption className="lab2-spec-name" data-lab-ink="">{name}</figcaption>
      <div className="lab2-spec-body">{children}</div>
    </figure>
  );
}

function Board({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="lab2-board">
      <h2 className="lab2-row-title" data-lab-ink="">{title}</h2>
      <div className="lab2-board-grid">{children}</div>
    </section>
  );
}

export function FrameComponents() {
  const d = frameToday('default');
  const h = d.heroes[0];
  const hero = (over: Partial<HeroMetricProps>): HeroMetricProps => ({ ...h, ...over });
  const tile = (over: Partial<TileProps>): TileProps => ({ ...d.yourPosts[0], ...over });
  return (
    <div className="lab lab-v2" data-lab-root="" data-lab-frame="components">
      <Aurora />
      <GlassBudgetProvider>
        <div className="lab2-page">
          <header className="lab2-head">
            <span className="lab2-back" data-lab-ink="">Content Lab</span>
            <h1 className="lab2-tab" aria-current="page" data-lab-ink="" style={{ borderBottom: 0 }}>Components</h1>
            <span className="lab2-head-tools"><span className="lab2-chip" data-lab-ink="">Sample data</span></span>
          </header>

          <Board title="Hero metric">
            <Spec name="ready"><HeroMetric {...hero({})} /></Spec>
            <Spec name="ready, count"><HeroMetric {...d.heroes[1]} /></Spec>
            <Spec name="thin (n 3)"><HeroMetric {...hero({ n: 3, nText: 'n 3' })} /></Spec>
            <Spec name="empty"><HeroMetric {...hero({ state: 'empty', n: 0, nText: 'n 0' })} /></Spec>
            <Spec name="not configured"><HeroMetric {...hero({ state: 'not-configured' })} /></Spec>
            <Spec name="loading"><HeroMetric {...hero({ state: 'loading' })} /></Spec>
          </Board>

          <Board title="Dot matrix">
            <Spec name="prev and current">
              <DotMatrix groups={h.groups} label="last 30d against this 30d" />
            </Spec>
            <Spec name="with context group">
              <DotMatrix
                groups={[{ id: 'ctx', label: 'before', values: [0.7, 0.9, 1.1, 0.8, 1.0, 0.9, 1.2, 0.8, 1.0, 0.9], emphasis: 'context' }, ...h.groups]}
                label="context, last and this period"
              />
            </Spec>
          </Board>

          <Board title="Narrative cards">
            <Spec name="brief, ready"><NarrativeCard {...d.brief} /></Spec>
            <Spec name="brief, thin"><NarrativeCard kind="brief" label="Brief" sentence={null} state="thin" /></Spec>
            <Spec name="brief, loading"><NarrativeCard kind="brief" label="Brief" sentence={null} state="loading" /></Spec>
            <Spec name="window, open (t 0.15)"><NarrativeCard {...frameToday('window-open').window} /></Spec>
            <Spec name="window, closing (t 0.7)"><NarrativeCard {...frameToday('window-closing').window} /></Spec>
            <Spec name="window, none"><NarrativeCard {...frameToday('window-none').window} /></Spec>
            <Spec name="window, not configured"><NarrativeCard {...frameToday('not-configured').window} /></Spec>
          </Board>

          <Board title="Tiles">
            <Spec name="ready, band"><Tile {...tile({ id: 'spec-band' })} /></Spec>
            <Spec name="ready, wave"><Tile {...d.launchRadar[1]} id="spec-wave" /></Spec>
            <Spec name="ready, ticks, delta">
              <Tile {...tile({ id: 'spec-ticks', title: 'Scraped', valueText: '441', format: 'count', n: 441, nText: 'n 441', foot: 'Last 7 days', delta: { text: '+12', dir: 'up' }, viz: { kind: 'ticks', values: [40, 52, 61, 48, 70, 88, 82, 64, 59, 71, 90, 66, 58, 74], highlight: [10] } })} />
            </Spec>
            <Spec name="ready, cap">
              <Tile {...tile({ id: 'spec-cap', title: 'Spend', valueText: '$8.20', format: 'money', n: 9, nText: 'n 9', foot: 'of $30 cap', viz: { kind: 'cap', spent: 8.2, cap: 30, currency: '$' } })} />
            </Spec>
            <Spec name="thin (n 4)"><Tile {...tile({ id: 'spec-thin', n: 4, nText: 'n 4' })} /></Spec>
            <Spec name="too new"><Tile {...d.yourPosts[3]} id="spec-new" /></Spec>
            <Spec name="loading"><Tile {...tile({ id: 'spec-load', state: 'loading' })} /></Spec>
          </Board>

          <Board title="Controls">
            <Spec name="segmented"><Segmented label="Today view" options={[{ id: 'brief', label: 'Brief' }, { id: 'ask', label: 'Ask the Lab' }]} /></Spec>
            <Spec name="segmented, count"><Segmented label="Activity" options={[{ id: 'a', label: 'Activities', countText: '36' }, { id: 'b', label: 'Assistance' }]} /></Spec>
            <Spec name="period scrubber"><PeriodScrubber periods={d.periods} label="Period" /></Spec>
            <Spec name="search pill"><SearchPill placeholder="Ask the Lab" /></Spec>
            <Spec name="action pill"><ActionPill label="Add source" href="?setup=sources&focus=add" /></Spec>
            <Spec name="action pill, play"><ActionPill label="Run now" icon="play" onClick={() => {}} /></Spec>
            <Spec name="action pill, busy 40%"><ActionPill label="Running, 2 of 5" busy progress={0.4} /></Spec>
            <Spec name="action pill, busy"><ActionPill label="Running, 2m" busy progress={null} /></Spec>
            <Spec name="action pill, disabled"><ActionPill label="New idea" disabled disabledReason="Sample data is a read-only preview." /></Spec>
            <Spec name="plus, round, arrows">
              <span style={{ display: 'inline-flex', gap: 12, alignItems: 'center' }}>
                <PlusButton label="Create" items={d.createMenu} />
                <RoundButton label="Setup" icon="menu" href="?setup=keys" />
                <ArrowButton label="Open" href="#" size={36} />
                <ArrowButton label="Open" href="#" size={32} />
              </span>
            </Spec>
          </Board>

          <Board title="Glass">
            {(['base', 'strong', 'tint', 'solid'] as const).map((t) => (
              <Spec key={t} name={`tone ${t}`}>
                <Glass tone={t} radius="tile" priority={2} className="lab2-card" style={{ width: 200, height: 96 }}>
                  <span className="lab2-card-text" data-lab-ink="">Glass {t}</span>
                </Glass>
              </Spec>
            ))}
          </Board>

          <Board title="Run progress and cost">
            <Spec name="progress row, determinate" wide>
              <Glass tone="strong" radius="tile" priority={2} className="lab2-card">
                <ProgressRow row={{ label: 'Instagram posts', targetsText: '8 creators', stateText: 'Running', fill: 0.46, countsText: '214 of 460', costText: '$0.41 of about $0.92', elapsedText: '1m 40s' }} />
              </Glass>
            </Spec>
            <Spec name="progress row, indeterminate" wide>
              <Glass tone="strong" radius="tile" priority={2} className="lab2-card">
                <ProgressRow row={{ label: 'X search', targetsText: '2 queries', stateText: 'Running', fill: null, countsText: '61 so far', elapsedText: '40s', statusMessage: 'Scraping tweets' }} />
              </Glass>
            </Spec>
            <Spec name="progress row, failed" wide>
              <Glass tone="strong" radius="tile" priority={2} className="lab2-card">
                <ProgressRow row={{ label: 'TikTok posts', targetsText: '5 creators', stateText: 'Failed', fill: 0.2, frozen: true, countsText: '40 of 200', failed: true, runLogHref: '?setup=spend' }} />
              </Glass>
            </Spec>
            <Spec name="stage list" wide>
              <Glass tone="strong" radius="tile" priority={2} className="lab2-card">
                <StageList
                  stages={[
                    { id: 'ingest', label: 'Ingest', state: 'done', stateText: 'done', countText: '214 of 214' },
                    { id: 'transcribe', label: 'Transcribe', state: 'running', stateText: 'running', countText: '3 of 9' },
                    { id: 'dissect', label: 'Dissect', state: 'waiting', stateText: 'waiting' },
                    { id: 'measure', label: 'Measure', state: 'failed', stateText: 'failed', note: 'Waiting for the running tick to finish' },
                  ]}
                />
              </Glass>
            </Spec>
            <Spec name="cost fit bar, fits / tight / over" wide>
              <Glass tone="strong" radius="tile" priority={2} className="lab2-card">
                <CostFitBar spent={8.2} estimate={{ low: 0.8, point: 1.0, high: 1.3 }} cap={30} fit="fits" />
                <CostFitBar spent={22} estimate={{ low: 1.5, point: 2.4, high: 3.2 }} cap={30} fit="tight" />
                <CostFitBar spent={28} estimate={{ low: 2, point: 3, high: 4 }} cap={30} fit="over" />
              </Glass>
            </Spec>
          </Board>
        </div>
      </GlassBudgetProvider>
    </div>
  );
}
