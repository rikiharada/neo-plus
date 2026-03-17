// lib/export/pdfGenerator.js
import 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const { jsPDF } = window.jspdf;
import { supabase } from '../supabase-client.js';

import { uploadPdfToDrive } from '../auth/googleDriveClient.js';

export async function generateAndUploadPDF(txs, filename = 'neo-transactions.pdf') {
  const doc = new jsPDF();
  doc.text('Neo+ Genesis 取引履歴', 20, 20);
  let y = 30;
  txs.forEach(tx => {
    doc.text(`${tx.date}  ¥${tx.amount}  ${tx.memo}`, 20, y);
    y += 10;
  });

  const pdfBlob = doc.output('blob');

  const url = await uploadPdfToDrive(pdfBlob, filename);

  // SupabaseにURL保存（プロフィール1行更新）
  await supabase.from('profiles').update({ drive_pdf_url: url }).eq('id', (await supabase.auth.getUser()).data.user.id);

  return url;
}
