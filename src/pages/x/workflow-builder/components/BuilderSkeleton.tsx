// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What the builder shows while it is being read.
 *
 * ⚠️ IT REUSES THE LOADED PAGE'S OWN CLASSES rather than describing the same
 * boxes again. `.card`, `.summary`, `.rail`, `.node`, `.detempty`, `.cprow` and
 * the rest bring their real padding, borders and radii with them, so the
 * skeleton's height follows the page's own layout rules instead of a set of
 * numbers copied beside them. Only the text is replaced, by blocks whose line
 * boxes are the heights the text would have occupied.
 *
 * Drawing it any other way is what makes a skeleton the wrong size, and a
 * skeleton of the wrong size is worse than a spinner: it makes the page settle
 * twice. A hand-sized copy of these boxes was 487px short at 1440 and 593px at
 * 1180, which is the failure this shape exists to prevent.
 *
 * Its shape is a four-Stage workflow with nothing selected -- the commonest
 * thing to be waiting for. A workflow of another length still settles without
 * the cards moving, because only the rail's own row count can change.
 *
 * ⚠️ A TILE'S HEIGHT CANNOT BE KNOWN BEFORE THE READ, so this one is
 * representative rather than correct. Every tile in a rail row equalises to the
 * tallest, and the tallest is whichever selector wraps furthest: one line for
 * `Labels.Stage = 'dev'`, four for `Labels.Stage = 'prod' AND Labels.Tier =
 * 'canary'`. Four is what the design's own four-Stage example carries, so four is
 * what this draws. Tuning it finer would be tuning against a workflow nobody has
 * loaded yet.
 */

const STAGES = 4;
const BUILTIN_ROWS = 3;
const CUSTOM_ROWS = 3;

/** One line of text that has not arrived, at the line box the text would fill. */
function Line({ w, kind = '' }: { w: number | string; kind?: string }) {
  return <div className={`skelline${kind ? ` ${kind}` : ''}`} style={{ width: w }} />;
}

export function BuilderSkeleton() {
  return (
    <div className='shell' aria-busy='true'>
      <span className='srOnly' role='status'>
        Reading the workflow
      </span>

      <Line w={96} />

      <section className='card' aria-hidden='true'>
        <div className='summary'>
          <div className='sumleft'>
            <div className='sumtitle'>
              <Line w={232} kind='lg' />
              <Line w={62} kind='pill' />
            </div>
            <dl className='facts'>
              <div style={{ gridColumn: 'span 2' }}>
                <Line w={72} kind='sm' />
                <Line w={168} />
              </div>
              {[132, 148, 156, 190].map((w) => (
                <div key={w}>
                  <Line w={64} kind='sm' />
                  <Line w={w} />
                </div>
              ))}
            </dl>
          </div>
          <div className='sumright'>
            <div className='skelbtn' />
            <div className='skelbtn' />
            <div className='skelbtn' />
            <Line w={150} kind='sm' />
          </div>
        </div>
      </section>

      <section className='card' aria-hidden='true'>
        <div className='cardhead'>
          <div>
            <Line w={54} />
            <Line w={420} kind='sm' />
          </div>
        </div>

        <div className='railbody'>
          <div className='rail'>
            {Array.from({ length: STAGES }, (_, i) => (
              <div className={`hop${i === 0 ? ' first' : ''}`} key={i}>
                {i > 0 ? (
                  <div className='gatelink skelplain'>
                    <div className='skeldot' />
                    <Line w={52} kind='sm' />
                    <Line w={64} kind='sm' />
                  </div>
                ) : null}
                <div className='node skelplain'>
                  <span className='nodetop'>
                    <div className='skeldot' />
                    <Line w={72} />
                  </span>
                  <Line w={86} kind='sm' />
                  <div className='skelwhere'>
                    {['100%', '92%', '86%', '54%'].map((w) => (
                      <Line w={w} kind='where' key={w} />
                    ))}
                  </div>
                </div>
              </div>
            ))}

            <div className='addtile skelplain' />

            <div className='hop'>
              <div className='gatelink skelplain'>
                <div className='skeldot' />
                <Line w={52} kind='sm' />
                <Line w={64} kind='sm' />
              </div>
              <div className='node fin skelplain'>
                <span className='nodetop'>
                  <div className='skeldot' />
                  <Line w={78} />
                </span>
                <Line w={132} kind='sm' />
              </div>
            </div>
          </div>
        </div>

        <div className='railfoot'>
          <Line w={320} kind='sm' />
        </div>

        <div className='detwrap'>
          <div className='detail'>
            <div className='detempty'>
              <Line w={112} />
              <Line w='94%' />
              <Line w='58%' />
              <div className='cov'>
                <Line w={78} />
                <Line w='90%' />
                <div className='covchips'>
                  {[92, 118, 104].map((w) => (
                    <div className='skelchip' key={w} style={{ width: w }} />
                  ))}
                </div>
                <Line w='88%' />
                <Line w='46%' />
              </div>
            </div>
          </div>

          <div className='cpcol'>
            <div className='cphead'>
              <Line w={92} />
            </div>
            <div className='cpsent'>
              <Line w='96%' />
              <Line w='72%' />
            </div>
            <div className='cplist'>
              <div className='cprow first'>
                <span className='cptop'>
                  <Line w={104} />
                  <div className='skeltag cptag' />
                </span>
                <Line w='92%' kind='sm' />
                <Line w='64%' kind='sm' />
              </div>
              {Array.from({ length: BUILTIN_ROWS }, (_, i) => (
                <div className='cprow' key={`b${i}`}>
                  <span className='cptop'>
                    <Line w={96} />
                    <div className='skeltag cptag' />
                  </span>
                  <Line w={172} kind='sm' />
                </div>
              ))}
              <div className='cpgroup'>
                <Line w='84%' kind='sm' />
              </div>
              {Array.from({ length: CUSTOM_ROWS }, (_, i) => (
                <div className='cprow' key={`c${i}`}>
                  <span className='cptop'>
                    <Line w={124} />
                    <div className='skeltag cptag' />
                  </span>
                  <Line w={162} kind='sm' />
                </div>
              ))}
            </div>
            <div className='cpadd'>
              <div className='skelbtn sm' style={{ width: 196 }} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
