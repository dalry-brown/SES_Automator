const http = require('http');

const fileName = 'SES Workflow – A Smarter Way to Process Invoices.pdf';
console.log('Filename:', fileName);
console.log('Has non-ASCII:', /[^\x20-\x7E]/.test(fileName));

try {
  const h = new http.OutgoingMessage();
  h.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
  console.log('Header set OK');
} catch (e) {
  console.log('Header THROWS:', e.code, e.message);
}
