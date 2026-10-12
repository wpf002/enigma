import { renderChain, type Factor } from '@enigma/provenance';
import PDFDocument from 'pdfkit';

interface DossierRow {
  rank: number;
  title: string;
  body: unknown;
}

type Body = Record<string, any>;

const INK = '#16181d';
const MUTED = '#5c6370';
const RULE = '#d7dae0';
const ACCENT = '#b4530a';

/** Renders a dossier to PDF: claim, results, comparability proof, ranking, cluster context, full provenance chain. */
export function renderDossierPdf(dossier: DossierRow, factors: unknown): Promise<Buffer> {
  const body = dossier.body as Body;
  const doc = new PDFDocument({ size: 'A4', margins: { top: 56, bottom: 56, left: 56, right: 56 }, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  const width = doc.page.width - 112;

  const heading = (text: string) => {
    doc.x = 56;
    doc.moveDown(1.1).font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text(text.toUpperCase(), 56, doc.y, { characterSpacing: 1.2 });
    doc.moveTo(56, doc.y + 3).lineTo(56 + width, doc.y + 3).lineWidth(0.5).strokeColor(RULE).stroke();
    doc.moveDown(0.6).font('Helvetica').fontSize(10).fillColor(INK);
  };
  const row = (label: string, value: string) => {
    const y = doc.y;
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(label, 56, y, { width: 130 });
    doc.font('Helvetica').fontSize(10).fillColor(INK).text(value, 190, y, { width: width - 134 });
    doc.x = 56;
    doc.moveDown(0.25);
  };

  doc.font('Helvetica-Bold').fontSize(9).fillColor(ACCENT).text(`ENIGMA DOSSIER ${dossier.rank}  /  ${body.type}`, { characterSpacing: 1.2 });
  doc.moveDown(0.4).font('Helvetica-Bold').fontSize(18).fillColor(INK).text(dossier.title);
  doc.moveDown(0.7).font('Helvetica').fontSize(11.5).fillColor(INK).text(body.sentence, { lineGap: 3 });

  heading('Summary');
  row('Diagnostic value', `${body.diagnosticValue.value.toFixed(2)}`);
  row('Severity', body.severity.toFixed(2));
  row('Gate confidence', `${body.comparabilityProof.gateScore.toFixed(2)} (threshold ${body.comparabilityProof.threshold.toFixed(2)})`);
  row('Snapshot', `${body.snapshot.aactVersion} (${body.snapshot.source}), sha256 ${String(body.snapshot.checksum).slice(0, 16)}`);
  row('Rule set', `${body.ruleSet.version}. ${body.ruleSet.rulesReviewed} of ${body.ruleSet.rulesTotal} harmonization rules clinician-reviewed`);

  heading('The two results');
  for (const p of body.parties as Body[]) {
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(INK).text(`${p.side}  ${p.label}`);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(ACCENT).text(p.effectText);
    doc.font('Helvetica').fontSize(9.5).fillColor(INK);
    for (const t of p.trials as Body[]) {
      const facts = [t.phase, t.status, t.enrollment ? `${t.enrollment} enrolled` : null, t.sponsor, t.completionDate ? `completed ${t.completionDate}` : null].filter(Boolean).join(', ');
      doc.text(`${t.title} (${t.nctId}${facts ? `; ${facts}` : ''})`);
      if (t.status === 'TERMINATED') doc.fillColor(MUTED).text(`Terminated: ${t.stopCategory ?? 'OTHER'}${t.whyStopped ? `. "${t.whyStopped}"` : ''}`).fillColor(INK);
    }
    if (p.record) {
      doc.fillColor(MUTED).text(`${p.record.outcomeTitle}${p.record.timeFrame ? ` (${p.record.timeFrame})` : ''}`);
      doc.text(`${p.record.experimentalLabel} vs ${p.record.comparatorLabel}. ${p.record.sourceKind === 'ANALYSIS' ? 'Posted analysis' : 'Computed from arm-level data'}, ${p.record.analysisPopulation}.`).fillColor(INK);
    }
    doc.moveDown(0.6);
  }

  heading('Comparability proof');
  doc.text(`Gate score ${body.comparabilityProof.gateScore.toFixed(2)} is the minimum across dimensions.`).moveDown(0.4);
  for (const d of body.comparabilityProof.dimensions as Body[]) {
    row(`${d.label}  ${d.score === null ? '' : d.score.toFixed(2)}`, `${d.statement ?? ''}${d.rule ? `  [${d.rule}]` : ''}`);
  }

  heading('Discriminating variable');
  const dv = body.discriminatingVariable as Body;
  doc.text(dv.basis === 'UNIDENTIFIED' ? 'Unidentified: no recorded covariate differs between the two.' : `${dv.name}: ${dv.a ?? 'not recorded'} vs ${dv.b ?? 'not recorded'}`);

  heading('Diagnostic value');
  for (const k of body.diagnosticValue.components as Body[]) row(k.label, `${k.value.toFixed(2)} x ${k.weight.toFixed(2)} = ${k.contribution.toFixed(3)}`);
  if (typeof body.diagnosticValue.zDiff === 'number') {
    doc.moveDown(0.3).fillColor(MUTED).fontSize(9).text(
      `Difference test: z = ${body.diagnosticValue.zDiff.toFixed(2)}, p = ${Number(body.diagnosticValue.pDiff).toExponential(2)}, q = ${Number(body.diagnosticValue.qDiff).toExponential(2)} (Benjamini-Hochberg).`,
    ).fillColor(INK).fontSize(10);
  }

  if (body.clusterContext) {
    const c = body.clusterContext as Body;
    heading('Cluster context');
    doc.text(`${c.label}. ${c.k} trials, ${c.nPatients} participants.`);
    if (c.stats?.pooled) doc.fillColor(MUTED).text(`I2 = ${(c.stats.pooled.i2 * 100).toFixed(0)}%, Q = ${c.stats.pooled.q.toFixed(1)} on ${c.stats.pooled.df} df.`).fillColor(INK);
    doc.moveDown(0.3).fontSize(9);
    for (const m of c.members as Body[]) {
      doc.text(`${m.label} (${m.nctId})  ${m.measure} ${m.value.toFixed(2)} (${m.ciLow?.toFixed(2)} to ${m.ciHigh?.toFixed(2)})  n=${m.n ?? 'n/a'}  ${m.completionDate ?? ''}`);
    }
    doc.fontSize(10);
  }

  heading('Already resolved?');
  doc.text(body.alreadyResolved
    ? `${body.alreadyResolved.coverage === 1 ? 'Covered' : 'Partly covered'} by: ${body.alreadyResolved.citation} ${body.alreadyResolved.conclusion}`
    : 'No review in the registry covers this conflict. The registry is small; absence here is not evidence that the conflict is new.');

  heading('Provenance chain');
  doc.font('Courier').fontSize(6.8).fillColor(INK);
  const chain = (factors as Factor[]).map((f) => ({ ...f, name: f.subject ? `${f.subject}:${f.name}` : f.name }));
  for (const line of renderChain(chain)) doc.text(line, { lineGap: 1.5 }).moveDown(0.25);

  doc.moveDown(1).font('Helvetica-Oblique').fontSize(8.5).fillColor(MUTED).text(body.grammarNote);

  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i += 1) {
    doc.switchToPage(i);
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(`Enigma  /  dossier ${dossier.rank}  /  page ${i + 1} of ${pages.count}`, 56, doc.page.height - 40, { width, align: 'right', lineBreak: false });
  }
  doc.end();
  return done;
}
