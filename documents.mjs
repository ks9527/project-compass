import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export async function parseDocument(input) {
  if(typeof input.name!=='string' || input.name.length>200 || !/\.(pdf|docx|txt|md)$/i.test(input.name)) throw new Error('支持 PDF、DOCX、TXT 和 Markdown 文件');
  if(typeof input.base64!=='string' || input.base64.length>17_000_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.base64)) throw new Error('文件格式错误或超过 12 MB');
  const buffer=Buffer.from(input.base64,'base64');
  if(!buffer.length || buffer.length>12*1024*1024) throw new Error('请选择不超过 12 MB 的有效文件');
  return new Promise((resolve,reject)=>{
    // Separate process: native PDF helpers cannot destabilize the database service.
    const worker=fork(fileURLToPath(new URL('./documents-worker.mjs',import.meta.url)),[],{execArgv:['--max-old-space-size=256'],env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:['ignore','ignore','ignore','ipc'],serialization:'advanced',windowsHide:true});
    let complete=false;
    const finish=(error,result)=>{if(complete)return;complete=true;clearTimeout(timer);worker.kill();error?reject(error):resolve(result);};
    const timer=setTimeout(()=>finish(new Error('文档解析超时，请拆分文档后重试')),30000);
    worker.on('message',message=>message.error?finish(new Error(message.error)):finish(null,message));
    worker.on('error',()=>finish(new Error('文档解析失败，文件可能损坏、加密或过于复杂')));
    worker.on('exit',()=>{if(!complete)finish(new Error('文档解析进程提前退出'));});
    worker.send({name:input.name,buffer});
  });
}
