const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');

const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
const FROM_ADDRESS = 'KALRO Security Operations <birichani.code@gmail.com>';

function createTransporter() {
  if (!SMTP_USER || !SMTP_PASS) {
    console.warn('SMTP_USER or SMTP_PASS is not configured. Email will not be sent.');
    return null;
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    },
    tls: {
      ciphers: 'TLSv1.2',
      rejectUnauthorized: false
    }
  });
}

async function sendSystemEmail({ to, subject, html, station_id = 'unknown', attachments = [] }) {
  const transporter = createTransporter();
  if (!transporter) {
    return { skipped: true, message: 'SMTP credentials not configured' };
  }

  const mailOptions = {
    from: FROM_ADDRESS,
    to,
    subject,
    html,
    headers: {
      'X-KALRO-Station-ID': station_id,
      'X-KALRO-Source': 'KALRO IKF Automated Email Notification System'
    },
    attachments
  };

  return transporter.sendMail(mailOptions);
}

function buildMajorIncidentEmail(incident, equilibrium, routine) {
  return `
    <div style="font-family:Arial,sans-serif;color:#1f3d25;line-height:1.5;">
      <h1 style="color:#2E7D32;">KALRO Major Incident Alert</h1>
      <p><strong>Station:</strong> ${incident.station_id}</p>
      <p><strong>Incident:</strong> ${incident.title}</p>
      <p><strong>Severity:</strong> ${incident.severity.toUpperCase()}</p>
      <p><strong>Description:</strong> ${incident.description || 'No description provided.'}</p>
      <h2 style="color:#C62828;">Recommended Response</h2>
      <p><strong>Action:</strong> ${equilibrium.recommendedAction.toUpperCase()}</p>
      <p><strong>Confidence:</strong> ${(equilibrium.confidence * 100).toFixed(0)}%</p>
      <p>${equilibrium.reasoning}</p>
      ${routine ? `
        <h2 style="color:#2E7D32;">Recommended Defensive Routine</h2>
        <p><strong>${routine.title}</strong></p>
        <p>${routine.content.substring(0, 250)}...</p>
      ` : ''}
      <hr />
      <p style="font-size:12px;color:#567059;">This email was generated automatically by the KALRO Game Theory Engine and delivered through the Institutional Knowledge Notification System.</p>
    </div>
  `;
}

function buildRoutineApprovalEmail(entry, approver) {
  return `
    <div style="font-family:Arial,sans-serif;color:#1f3d25;line-height:1.5;">
      <h1 style="color:#2E7D32;">KALRO Knowledge Update</h1>
      <p>A new Institutional Memory asset has been approved and published for use across the KALRO network.</p>
      <p><strong>Title:</strong> ${entry.title}</p>
      <p><strong>Source Station:</strong> ${entry.station_id || 'HQ'}</p>
      <p><strong>Approved By:</strong> ${approver.name || approver.email}</p>
      <p><strong>Summary:</strong> ${entry.content.substring(0, 250)}...</p>
      <p>Visit the Knowledge Base to review the full defensive routine and apply it during incident response.</p>
      <hr />
      <p style="font-size:12px;color:#567059;">Delivered by the KALRO Institutional Knowledge Notification System.</p>
    </div>
  `;
}

function buildSocioTechnicalGapEmail(incident, analysis) {
  return `
    <div style="font-family:Arial,sans-serif;color:#1f3d25;line-height:1.5;">
      <h1 style="color:#C62828;">KALRO STS Alert</h1>
      <p>An incident has been tagged with a socio-technical gap requiring administrator attention.</p>
      <p><strong>Incident:</strong> ${incident.title}</p>
      <p><strong>Station:</strong> ${incident.station_id}</p>
      <p><strong>Root Cause Type:</strong> ${analysis.root_cause_type}</p>
      <p><strong>STS Risk Score:</strong> ${analysis.sts_risk_score}</p>
      <p><strong>Recommended Resolution:</strong> ${analysis.recommended_resolution_type}</p>
      <h2 style="color:#2E7D32;">Factors Identified</h2>
      <p><strong>Technical:</strong> ${analysis.technical_factors.join(', ') || 'None'}</p>
      <p><strong>Social:</strong> ${analysis.social_factors.join(', ') || 'None'}</p>
      <hr />
      <p style="font-size:12px;color:#567059;">This alert is part of the KALRO Socio-Technical Bridge, linking technical detection to operational governance.</p>
    </div>
  `;
}

function buildResilienceReportHtml(report) {
  return `
    <div style="font-family:Arial,sans-serif;color:#1f3d25;line-height:1.5;">
      <h1 style="color:#2E7D32;">KALRO Resilience Report</h1>
      <p>This scheduled report summarizes resilience metrics, socio-technical posture, and strategic readiness.</p>
      <h2 style="color:#C62828;">Resilience Summary</h2>
      <ul>
        <li><strong>Resilience Score:</strong> ${report.metrics.resilience_score}</li>
        <li><strong>SLA Breach Rate:</strong> ${report.metrics.sla_breach_rate}</li>
        <li><strong>Knowledge Utilization:</strong> ${report.metrics.knowledge_utilization_rate}</li>
        <li><strong>Routine Success Rate:</strong> ${report.metrics.routine_success_rate}</li>
      </ul>
      <h2 style="color:#2E7D32;">Socio-Technical Findings</h2>
      <ul>
        <li><strong>Total STS incidents analyzed:</strong> ${report.stsReport.total_incidents_analyzed}</li>
        <li><strong>Technical-only:</strong> ${report.stsReport.breakdown.technical_only}</li>
        <li><strong>Social-only:</strong> ${report.stsReport.breakdown.social_only}</li>
        <li><strong>Hybrid:</strong> ${report.stsReport.breakdown.hybrid}</li>
      </ul>
      <p>The attached PDF contains the full resilience dashboard and recommended actions.</p>
      <hr />
      <p style="font-size:12px;color:#567059;">Station-level header included via email station header.</p>
    </div>
  `;
}

async function createResilienceReportPdf(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const buffers = [];

    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(18).fillColor('#2E7D32').text('KALRO Resilience Report', { align: 'center' });
    doc.moveDown();
    doc.font('Helvetica').fontSize(12).fillColor('#1f3d25');
    doc.text(`Generated: ${new Date().toISOString()}`);
    doc.moveDown();

    doc.font('Helvetica-Bold').fontSize(14).fillColor('#C62828').text('Resilience Metrics');
    doc.moveDown(0.5);
    Object.entries(report.metrics).forEach(([label, value]) => {
      doc.font('Helvetica-Bold').fillColor('#2E7D32').text(`${label.replace(/_/g, ' ')}:`, { continued: true }).font('Helvetica').fillColor('#1f3d25').text(` ${value}`);
    });
    doc.moveDown();

    doc.font('Helvetica-Bold').fontSize(14).fillColor('#2E7D32').text('Socio-Technical Findings');
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(12).fillColor('#1f3d25');
    doc.text(`Total incidents analyzed: ${report.stsReport.total_incidents_analyzed}`);
    doc.text(`Technical-only: ${report.stsReport.breakdown.technical_only}`);
    doc.text(`Social-only: ${report.stsReport.breakdown.social_only}`);
    doc.text(`Hybrid: ${report.stsReport.breakdown.hybrid}`);
    doc.moveDown();

    if (report.stsReport.top_technical_factors.length) {
      doc.font('Helvetica-Bold').fillColor('#2E7D32').text('Top Technical Factors');
      report.stsReport.top_technical_factors.forEach(f => doc.font('Helvetica').fillColor('#1f3d25').text(`• ${f.factor} (${f.count})`));
      doc.moveDown();
    }
    if (report.stsReport.top_social_factors.length) {
      doc.font('Helvetica-Bold').fillColor('#2E7D32').text('Top Social Factors');
      report.stsReport.top_social_factors.forEach(f => doc.font('Helvetica').fillColor('#1f3d25').text(`• ${f.factor} (${f.count})`));
      doc.moveDown();
    }

    doc.font('Helvetica-Bold').fillColor('#C62828').text('Recommendations');
    report.stsReport.recommendations.forEach(rec => {
      doc.font('Helvetica-Bold').fillColor('#2E7D32').text(`${rec.priority.toUpperCase()}: ${rec.type}`);
      doc.font('Helvetica').fillColor('#1f3d25').text(`- ${rec.action}`);
    });

    doc.end();
  });
}

module.exports = {
  sendSystemEmail,
  buildMajorIncidentEmail,
  buildRoutineApprovalEmail,
  buildSocioTechnicalGapEmail,
  buildResilienceReportHtml,
  createResilienceReportPdf
};
