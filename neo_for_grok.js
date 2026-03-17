const fs = require('fs');
const path = require('path');

const filesToInclude = [
  'index.html',
  'js/app.js',
  'js/gemini.js',
  'lib/api/geminiClient.js',
  'api/gemini.js',
  'views/home.html',
  'views/chat.html',
  'css/index.css',
  'css/components.css'
];

let output = '# Neo+ Core Codebase\n\n';

for (const file of filesToInclude) {
  if (fs.existsSync(file)) {
    output += `\n## File: ${file}\n\`\`\`${file.endsWith('.js') ? 'javascript' : file.endsWith('.css') ? 'css' : 'html'}\n`;
    output += fs.readFileSync(file, 'utf8') + '\n\`\`\`\n';
  }
}

fs.writeFileSync('neo_core_for_grok.txt', output);
console.log('neo_core_for_grok.txt created.');
