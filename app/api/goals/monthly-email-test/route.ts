import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function escapePdfText(value: string) {
  return value.replace(/[^\x20-\x7E]/g, '?').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildTestPdf() {
  const lines = [
    'SG Goals - Monthly Summary Email Test',
    '',
    'Your automatic monthly PDF email is connected.',
    'The real report will include completed and failed points by date.',
    'Next scheduled report: September 5, 2026 at 3:00 AM IST.'
  ];
  const content = `BT\n/F1 12 Tf\n50 760 Td\n${lines.map((line, index) => `${index ? '0 -18 Td\n' : ''}(${escapePdfText(line)}) Tj`).join('\n')}\nET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content, 'binary')} >>\nstream\n${content}\nendstream`
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'binary'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'binary');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'binary');
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { token?: string } | null;
  if (!process.env.MONTHLY_EMAIL_TEST_TOKEN || body?.token !== process.env.MONTHLY_EMAIL_TEST_TOKEN) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    return NextResponse.json({ error: 'Resend variables are missing.' }, { status: 503 });
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': 'sg-goals-monthly-email-test-2026-08-22'
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL,
      to: ['gouda3859@gmail.com'],
      subject: 'SG Goals monthly PDF - test successful',
      html: '<p>Your SG Goals monthly report email is connected.</p><p>The attached PDF is a test. Your real report is scheduled for September 5, 2026 at 3:00 AM IST.</p>',
      attachments: [{ filename: 'sg-goals-monthly-test.pdf', content: buildTestPdf().toString('base64') }]
    })
  });
  const result = (await response.json()) as { id?: string; message?: string };
  if (!response.ok) return NextResponse.json({ error: result.message || 'Resend rejected the test email.' }, { status: response.status });
  return NextResponse.json({ ok: true, id: result.id });
}
