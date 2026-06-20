const fs = require('fs');
const lines = fs.readFileSync('C:\\Users\\ABHISHEK\\.gemini\\antigravity-ide\\brain\\4a839229-9633-438e-9966-98b26b1fc852\\.system_generated\\logs\\transcript.jsonl', 'utf8').split('\n');
let extracted = '';
for (let l of lines) {
  if (!l) continue;
  try {
    const obj = JSON.parse(l);
    if (obj.type === 'USER_INPUT' && obj.content && obj.content.includes('pos.html')) {
      const content = obj.content;
      // The document marker usually looks like: <document path="c:\Users\ABHISHEK\OneDrive\Desktop\Cafe Orbit\frontend\pos.html">
      const searchStr = '<document path="c:\\Users\\ABHISHEK\\OneDrive\\Desktop\\Cafe Orbit\\frontend\\pos.html">';
      const searchStr2 = '<document path="C:\\Users\\ABHISHEK\\OneDrive\\Desktop\\Cafe Orbit\\frontend\\pos.html">';
      
      let startIndex = content.indexOf(searchStr);
      if (startIndex === -1) startIndex = content.indexOf(searchStr2);

      if (startIndex !== -1) {
        // find the first newline after the marker
        const contentStart = content.indexOf('\n', startIndex) + 1;
        const endMarker = '</document>';
        const endIdx = content.indexOf(endMarker, contentStart);
        if (endIdx !== -1) {
          extracted = content.substring(contentStart, endIdx).trim();
          break; // Found it!
        }
      }
    }
  } catch(e) {}
}

if (extracted) {
  fs.writeFileSync('C:\\Users\\ABHISHEK\\OneDrive\\Desktop\\Cafe Orbit\\frontend\\pos.html', extracted);
  console.log('Recovered pos.html, length: ' + extracted.length);
} else {
  console.log('Could not find pos.html in transcript.');
}
