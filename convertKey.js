const fs = require('fs');
let key = fs.readFileSync('./b11a12-sariakhatun-firebase-adminsdk-fbsvc-306524a2c3.json','utf8')
let base64 = Buffer.from(key).toString('base64');
console.log(base64)