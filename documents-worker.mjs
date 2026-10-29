import path from 'node:path';
process.once('message',async workerData=>{
try {
  const buffer=Buffer.from(workerData.buffer), ext=path.extname(workerData.name).toLowerCase();
  let text='', warning='';
  if(ext==='.pdf') {
    if(buffer.subarray(0,5).toString()!=='%PDF-')throw new Error('不是有效的 PDF 文件');
    const { PDFParse }=await import('pdf-parse');
    const parser=new PDFParse({data:buffer,isEvalSupported:false});
    try { const info=await parser.getInfo(); if(info.total>150)throw new Error('PDF 超过 150 页，请拆分后上传'); const result=await parser.getText();text=result.text; } finally {await parser.destroy();}
  } else if(ext==='.docx') {
    if(buffer.subarray(0,2).toString()!=='PK')throw new Error('不是有效的 DOCX 文件');
    // Bound expanded ZIP size before letting the Word parser read document contents.
    const { default: JSZip }=await import('jszip');
    const zip=await JSZip.loadAsync(buffer);
    let total=0; for(const entry of Object.values(zip.files)){total+=entry._data?.uncompressedSize || 0; if(total>40*1024*1024)throw new Error('DOCX 解压后过大，请拆分文档');}
    if(!zip.file('word/document.xml'))throw new Error('DOCX 缺少正文');
    const mammoth=await import('mammoth');
    text=(await mammoth.extractRawText({buffer})).value;
  } else {
    if(buffer.subarray(0,2).equals(Buffer.from([0xff,0xfe])))text=buffer.subarray(2).toString('utf16le');
    else text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);
  }
  text=text.replace(/\u0000/g,'').trim();
  if(!text)throw new Error('未提取到文字。扫描版 PDF 暂不支持 OCR，请先转为可复制文字的文档');
  if(text.length>60000){text=text.slice(0,60000);warning='正文较长，仅保留前 60,000 字符；未保留的内容不会参与分析。';}
  process.send({name:workerData.name,text,warning,uploadedAt:new Date().toISOString()});
}catch(e){process.send({error: e.message?.startsWith('The encoded data')?'文字文件请另存为 UTF-8 格式':e.message || '解析失败'});}
});
