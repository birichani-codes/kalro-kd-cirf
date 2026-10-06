const PDFDocument = require('pdfkit');

function formatMinutes(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return 'Pending';
  const n = Number(v);
  if (n < 1) return `${Math.round(n * 60)} sec`;
  return `${n.toFixed(2)} min`;
}

function formatPct(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return 'Pending';
  return `${Number(v).toFixed(1)}%`;
}

function safe(v, fallback='Not recorded') {
  if (v === null || v === undefined || String(v).trim() === '') return fallback;
  return String(v);
}

function humanEvent(name='') {
  return String(name).replace(/_/g,' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function createOperationalTestReportPdf({ test, incident, kpis, selectedKnowledge, capturedKnowledge, events }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size:'A4', margin:46, bufferPages:true, info:{
        Title:`KALRO Operational Test Report - ${test.id}`,
        Author:'KALRO KD-CIRF',
        Subject:test.scenario_name || 'Operational Test Report'
      }});
      const chunks=[];
      doc.on('data', c=>chunks.push(c));
      doc.on('end', ()=>resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const green = '#2f6f4e';
      const dark = '#1d2a24';
      const muted = '#66736c';
      const light = '#eef3f0';
      const amber = '#8c6b19';

      const ensureSpace = h => {
        if (doc.y + h > doc.page.height - doc.page.margins.bottom - 24) doc.addPage();
      };
      const section = title => {
        ensureSpace(40);
        doc.moveDown(0.6);
        doc.font('Helvetica-Bold').fontSize(13).fillColor(dark).text(title);
        doc.moveTo(doc.page.margins.left, doc.y + 4).lineTo(doc.page.margins.left + pageWidth, doc.y + 4).strokeColor('#d5ddd8').lineWidth(0.7).stroke();
        doc.moveDown(0.8);
      };
      const keyValue = (label, value, opts={}) => {
        ensureSpace(28);
        const y = doc.y;
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(muted).text(label, doc.page.margins.left, y, {width:150});
        doc.font('Helvetica').fontSize(10).fillColor(dark).text(safe(value), doc.page.margins.left+155, y, {width:pageWidth-155});
        doc.moveDown(opts.compact ? 0.55 : 0.8);
      };
      const bulletList = items => {
        (items||[]).forEach(item=>{
          ensureSpace(24);
          doc.font('Helvetica').fontSize(9.5).fillColor(dark).text(`• ${safe(item)}`, {indent:8, paragraphGap:3});
        });
      };
      const statusLabel = value => {
        const v = String(value||'').toLowerCase();
        if (v==='successful'||v==='completed'||v==='closed') return 'Successful';
        if (v==='partial') return 'Partial';
        if (v==='failed') return 'Failed';
        return safe(value,'Pending');
      };

      // Header
      doc.rect(doc.page.margins.left, 38, pageWidth, 74).fill(green);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20).text('KALRO Operational Test Report', doc.page.margins.left+18, 55, {width:pageWidth-36});
      doc.font('Helvetica').fontSize(10).text(safe(test.scenario_name), doc.page.margins.left+18, 84, {width:pageWidth-36});
      doc.y = 128;
      doc.fillColor(dark).font('Helvetica-Bold').fontSize(10).text(`Test ID: ${safe(test.id)}`);
      doc.font('Helvetica').fillColor(muted).text(`Generated: ${new Date().toLocaleString()}`);

      section('Incident Overview');
      keyValue('Incident ID', incident?.id);
      keyValue('Title', incident?.title || test.scenario_name);
      keyValue('Status', incident?.status || test.status);
      keyValue('Severity', test.classification?.severity || incident?.severity);
      keyValue('Category', test.classification?.category || incident?.type);
      keyValue('Affected asset / account', test.classification?.affected_asset || incident?.entities?.affected_user || incident?.entities?.affected_asset);
      keyValue('Participant', `${safe(test.participant_label)} (${safe(test.participant_role)})`);
      keyValue('Station', test.station_id);

      section('Performance Indicators');
      const metrics = [
        ['MTTD',formatMinutes(kpis?.mttd_minutes)],['MTTA',formatMinutes(kpis?.mtta_minutes)],['Classification time',formatMinutes(kpis?.classification_minutes)],
        ['Knowledge retrieval',formatMinutes(kpis?.knowledge_retrieval_minutes)],['MTTC',formatMinutes(kpis?.mttc_minutes)],['MTTR',formatMinutes(kpis?.mttr_minutes)],
        ['Knowledge utilization',formatPct(kpis?.knowledge_utilization_rate)],['Knowledge reuse success',formatPct(kpis?.knowledge_reuse_success_rate)]
      ];
      const cols=2, boxGap=10, boxW=(pageWidth-boxGap)/cols, boxH=47;
      metrics.forEach((m,i)=>{
        if (i%cols===0) ensureSpace(boxH+8);
        const x=doc.page.margins.left+(i%cols)*(boxW+boxGap), y=doc.y;
        doc.roundedRect(x,y,boxW,boxH,5).fillAndStroke(light,'#dce5e0');
        doc.fillColor(muted).font('Helvetica-Bold').fontSize(8.5).text(m[0],x+10,y+8,{width:boxW-20});
        doc.fillColor(dark).font('Helvetica-Bold').fontSize(14).text(m[1],x+10,y+22,{width:boxW-20});
        if(i%cols===cols-1||i===metrics.length-1) doc.y=y+boxH+8; else doc.y=y;
      });

      section('Structured Classification');
      keyValue('Category', test.classification?.category);
      keyValue('Severity', test.classification?.severity);
      keyValue('Confidence', test.classification?.confidence);
      keyValue('Initial impact', test.classification?.impact);
      keyValue('Suspected cause', test.classification?.suspected_cause);
      keyValue('Classification notes', test.classification?.notes);

      section('Knowledge Used');
      const selectedItems = Array.isArray(selectedKnowledge) ? selectedKnowledge : (selectedKnowledge ? [selectedKnowledge] : []);
      if (selectedItems.length) {
        keyValue('Knowledge entries selected', selectedItems.length);
        selectedItems.forEach((item,idx)=>{
          ensureSpace(44);
          doc.font('Helvetica-Bold').fontSize(9.5).fillColor(dark).text(`${idx+1}. ${safe(item.id)} - ${safe(item.title)}`);
          doc.font('Helvetica').fontSize(8.8).fillColor(muted).text(`Type: ${safe(item.knowledge_type)} | Confidence: ${item.confidence_score==null?'Not recorded':Math.round(Number(item.confidence_score)*100)+'%'}`);
        });
        keyValue('Selection confirmed', test.knowledge_selection_confirmed_at ? new Date(test.knowledge_selection_confirmed_at).toLocaleString() : 'Not recorded');
        keyValue('Combined application outcome', test.knowledge_application?.outcome || 'Applied');
      } else {
        doc.font('Helvetica').fontSize(10).fillColor(muted).text('No institutional knowledge entry was selected.');
      }

      section('Containment');
      keyValue('Outcome', statusLabel(test.containment?.outcome));
      keyValue('Evidence', test.containment?.evidence);
      keyValue('Notes', test.containment?.notes);
      const containmentRecords = test.containment?.action_records || [];
      if (containmentRecords.length) {
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(dark).text('Actions');
        containmentRecords.forEach(r=>{
          ensureSpace(34);
          const label=`${statusLabel(r.status)} - ${safe(r.action)}`;
          doc.font('Helvetica').fontSize(9.3).fillColor(dark).text(`• ${label}`);
          if (r.evidence) doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(muted).text(`  Evidence: ${r.evidence}`, {indent:8});
        });
      } else bulletList(test.containment?.completed_actions||[]);
      if (test.containment?.verification_checks?.length) {
        doc.moveDown(0.4); doc.font('Helvetica-Bold').fontSize(9.5).fillColor(dark).text('Verification checks');
        bulletList(test.containment.verification_checks);
      }

      section('Recovery');
      keyValue('Outcome', statusLabel(test.recovery?.outcome));
      keyValue('Validation evidence', test.recovery?.evidence);
      keyValue('Notes', test.recovery?.notes);
      const recoveryRecords=test.recovery?.action_records||[];
      if(recoveryRecords.length){
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(dark).text('Actions');
        recoveryRecords.forEach(r=>{
          ensureSpace(32);
          doc.font('Helvetica').fontSize(9.3).fillColor(dark).text(`• ${statusLabel(r.status)} - ${safe(r.action)}`);
          if(r.evidence) doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(muted).text(`  Evidence: ${r.evidence}`, {indent:8});
        });
      } else bulletList(test.recovery?.actions||[]);

      if((test.collaborations||[]).length){
        section('Collaboration');
        (test.collaborations||[]).forEach((c,idx)=>{
          keyValue(`Collaboration ${idx+1}`, c.collaborate_with);
          keyValue('Reason', c.reason);
          keyValue('Assistance required', c.assistance_required);
          keyValue('Shared response summary', c.shared_summary);
          keyValue('Response team', (c.team_members||[]).map(m=>`${m.name} (${m.role}${m.station_id?' - '+m.station_id:''})`).join(', '));
          keyValue('Google Meet', c.meeting_url);
          keyValue('Meeting agenda', c.meeting_agenda);
        });
      }

      if(test.escalation){
        section('Escalation');
        keyValue('Reason', test.escalation.reason);
        keyValue('Escalated to', test.escalation.escalated_to);
        keyValue('Priority', test.escalation.priority);
        keyValue('Assistance required', test.escalation.assistance_required);
        keyValue('Situation summary', test.escalation.shared_summary);
        keyValue('Escalation team', (test.escalation.team_members||[]).map(m=>`${m.name} (${m.role}${m.station_id?' - '+m.station_id:''})`).join(', '));
        keyValue('Google Meet', test.escalation.meeting_url);
        keyValue('Meeting agenda', test.escalation.meeting_agenda);
      }

      section('Operational Assessment');
      const obs = test.observer_scores || {};
      keyValue('Decision accuracy', obs.decision_accuracy == null ? 'Not recorded' : `${obs.decision_accuracy}%`);
      keyValue('Classification accuracy', obs.classification_accuracy == null ? 'Not recorded' : `${obs.classification_accuracy}%`);
      keyValue('Escalation accuracy', obs.escalation_accuracy == null ? 'Not recorded' : `${obs.escalation_accuracy}%`);
      keyValue('Role adherence', obs.role_adherence == null ? 'Not recorded' : `${obs.role_adherence}%`);
      keyValue('Assistance prompts', obs.facilitator_interventions == null ? 'Not recorded' : obs.facilitator_interventions);
      keyValue('Critical omissions', obs.critical_omissions == null ? 'Not recorded' : obs.critical_omissions);

      section('Outcome and Lessons');
      keyValue('Incident outcome', incident?.status === 'closed' ? 'Closed after validated recovery' : incident?.status);
      const lessons = capturedKnowledge||[];
      if(lessons.length){
        lessons.forEach((lesson,idx)=>{
          keyValue(`Lesson ${idx+1} ID`, lesson.id);
          keyValue('Status', lesson.status);
          keyValue('Lesson title', lesson.title);
          keyValue('What worked', lesson.structured_lesson?.what_worked || lesson.content);
          keyValue('What should change next time', lesson.structured_lesson?.next_time);
          if(lesson.proposed_update_for) keyValue('Proposed update for', lesson.proposed_update_for);
        });
      } else doc.font('Helvetica').fontSize(10).fillColor(muted).text('No lesson has been captured yet.');

      section('Event Timeline');
      if(!(events||[]).length){
        doc.font('Helvetica').fontSize(10).fillColor(muted).text('No timeline events recorded.');
      } else {
        (events||[]).forEach(e=>{
          ensureSpace(36);
          const time = new Date(e.timestamp).toLocaleString();
          doc.font('Helvetica-Bold').fontSize(8.8).fillColor(green).text(time,{continued:true});
          doc.fillColor(dark).text(`   ${humanEvent(e.event_type)}`);
          const detailParts=[];
          if(e.details?.knowledge_id) detailParts.push(`Knowledge ${e.details.knowledge_id}`);
          if(e.details?.outcome) detailParts.push(`Outcome ${e.details.outcome}`);
          if(e.details?.reason) detailParts.push(e.details.reason);
          if(detailParts.length) doc.font('Helvetica').fontSize(8.3).fillColor(muted).text(detailParts.join(' - '),{indent:12});
          doc.moveDown(0.25);
        });
      }

      // Footer on each page
      const pages = doc.bufferedPageRange();
      for(let i=0;i<pages.count;i++){
        doc.switchToPage(i);
        const y=doc.page.height-30;
        doc.moveTo(doc.page.margins.left,y-8).lineTo(doc.page.width-doc.page.margins.right,y-8).strokeColor('#d7dfda').lineWidth(0.5).stroke();
        doc.font('Helvetica').fontSize(8).fillColor(muted).text('KALRO KD-CIRF - Operational Testing',doc.page.margins.left,y,{width:pageWidth/2});
        doc.text(`Page ${i+1} of ${pages.count}`,doc.page.margins.left+pageWidth/2,y,{width:pageWidth/2,align:'right'});
      }

      doc.end();
    } catch (err) { reject(err); }
  });
}

module.exports = { createOperationalTestReportPdf };
