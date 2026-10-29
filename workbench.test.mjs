import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import {renderMarkdown,renderAnalysis} from './public/report-format.js';
import JSZip from 'jszip';
const tempRoot=process.env.WORKBENCH_TEST_TEMP_DIR||os.tmpdir();
const temp=mkdtempSync(path.join(tempRoot,'workbench-test-'));
const mock=path.join(temp,'mock-fetch.mjs');
writeFileSync(mock, `globalThis.fetch=async(url, options)=>{const b=JSON.parse(options.body); if(url!=='https://api.deepseek.com/v1/chat/completions'||options.headers.Authorization!=='Bearer fake-test-key-only')throw new Error('mock verification failed'); let content='测试建议：核实预算与决策人。';if(b.messages[0].content.includes('连接测试'))content='OK';if(b.messages[0].content.includes('资料提取助手'))content=JSON.stringify({customer:'虚构文档客户',background:'来源：test.txt，客户明确提出100席位需求',stakeholders:[{name:'测试经理',role:'技术负责人',notes:'test.txt：测试经理负责技术评估'}],evidence:[{field:'客户',source:'test.txt',quote:'虚构文档客户'}]});return new Response(JSON.stringify({choices:[{message:{content}}]}),{headers:{'Content-Type':'application/json'}});};`);
const port=14317, base=`http://127.0.0.1:${port}`;
let child;
const request=async(route,method='GET',body,headers={})=>fetch(base+route,{method,headers:{'Content-Type':'application/json','X-Workbench':'1',...headers},...(body?{body:JSON.stringify(body)}:{})});
before(async()=>{child=spawn(process.execPath,['--disable-warning=ExperimentalWarning','--import',pathToFileURL(mock).href,'server.mjs'],{cwd:import.meta.dirname,env:{...process.env,PORT:String(port),WORKBENCH_DATA_DIR:temp},stdio:['ignore','pipe','pipe'],windowsHide:true});await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('启动超时')),10000);child.once('error',reject);child.once('exit',()=>reject(new Error('服务提前退出')));child.stdout.once('data',()=>{clearTimeout(timer);resolve();});});});
after(async()=>{if(child&&child.exitCode===null){const closed=new Promise(r=>child.once('exit',r));child.kill();await closed;}const resolved=path.resolve(temp);assert.ok(resolved.startsWith(path.resolve(tempRoot)+path.sep));rmSync(resolved,{recursive:true,force:true});});
test('项目的完整记录可持久化、修改和删除',async()=>{let r=await request('/api/projects','POST',{name:'虚构测试',customer:'示例客户',stakeholders:[{name:'示例人',role:'技术评估'}],actions:[{title:'确认预算',status:'待开始'}]});assert.equal(r.status,200);let p=await r.json();assert.ok(p.id);p.actions[0].status='已完成';await request('/api/projects','POST',p);let state=await(await request('/api/state')).json();assert.equal(state.projects.find(x=>x.id===p.id).actions[0].status,'已完成');await request('/api/projects/'+p.id,'DELETE');state=await(await request('/api/state')).json();assert.ok(!state.projects.some(x=>x.id===p.id));});
test('拒绝跨站写入、非受信 Host 与缺少校验头的请求',async()=>{assert.equal((await request('/api/projects','POST',{name:'x'},{Origin:'https://evil.example'})).status,403);const hostStatus=await new Promise((resolve,reject)=>{http.get(base+'/api/state',{headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);});assert.equal(hostStatus,403);assert.equal((await fetch(base+'/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"name":"x"}'})).status,403);});
test('校验项目字段和接口地址，分析必须明确确认',async()=>{assert.equal((await request('/api/projects','POST',{name:''})).status,400);assert.equal((await request('/api/settings','POST',{endpoint:'http://example.com',model:'x',provider:'custom'})).status,400);let r=await request('/api/analyze','POST',{text:'示例资料'});assert.equal(r.status,400);assert.match((await r.json()).error,/确认/);});
test('密钥加密、确认后的模型转发、读取隔离与删除密钥',async()=>{let r=await request('/api/settings','POST',{provider:'deepseek',endpoint:'https://api.deepseek.com/v1',model:'deepseek-chat',key:'fake-test-key-only'});assert.equal(r.status,200);let s=await r.json();assert.equal(s.hasKey,true);let state=await(await request('/api/state')).json();assert.equal(state.settings.key,undefined);assert.ok(!JSON.stringify(state).includes('fake-test-key-only'));r=await request('/api/analyze','POST',{confirmed:true,text:'虚构分析资料'});const answer=await r.json();assert.equal(r.status,200,JSON.stringify(answer));assert.match(answer.text,/核实预算/);r=await request('/api/settings','POST',{provider:'custom',endpoint:'https://example.com/v1',model:'x'});assert.equal(r.status,400);r=await request('/api/settings','POST',{provider:'deepseek',endpoint:s.endpoint,model:s.model,clearKey:true});assert.equal((await r.json()).hasKey,false);r=await request('/api/analyze','POST',{confirmed:true,text:'示例资料'});assert.match((await r.json()).error,/配置 API Key/);});
test('静态页面包含内容安全策略和本地资源',async()=>{const r=await request('/');assert.equal(r.status,200);assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.match(await r.text(),/项目指南针/);assert.equal((await request('/does-not-exist')).status,404);});

test('首次配置必须经过连接测试，文档提取只返回草稿、不自动修改项目',async()=>{
 await request('/api/settings','POST',{provider:'deepseek',endpoint:'https://api.deepseek.com/v1',model:'deepseek-chat',key:'fake-test-key-only'});
 assert.equal((await(await request('/api/state')).json()).settings.connected,false);
 let r=await request('/api/settings/test','POST',{});assert.equal(r.status,200);assert.equal((await r.json()).connected,true);
 const before=(await(await request('/api/state')).json()).projects;
 r=await request('/api/extract','POST',{text:'虚构文档资料'});assert.equal(r.status,400);
 r=await request('/api/extract','POST',{text:'【test.txt】虚构文档客户需要100席位。测试经理负责技术评估。',confirmed:true});assert.equal(r.status,200);const result=await r.json();assert.equal(result.candidate.customer,'虚构文档客户');assert.equal(result.candidate.stage,'');assert.equal(result.evidence[0].source,'test.txt');
 assert.deepEqual((await(await request('/api/state')).json()).projects,before);
});

test('TXT 和 DOCX 在本地提取，拒绝伪装文件和超限文件',async()=>{
 let r=await request('/api/documents/parse','POST',{name:'测试.txt',base64:Buffer.from('虚构文档客户需要100席位。').toString('base64')});assert.equal(r.status,200);assert.match((await r.json()).text,/100席位/);
 const zip=new JSZip();zip.file('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');zip.file('word/document.xml','<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Word测试正文</w:t></w:r></w:p></w:body></w:document>');
 r=await request('/api/documents/parse','POST',{name:'test.docx',base64:(await zip.generateAsync({type:'nodebuffer'})).toString('base64')});assert.equal(r.status,200,JSON.stringify(await r.clone().json()));assert.match((await r.json()).text,/Word测试正文/);
 r=await request('/api/documents/parse','POST',{name:'test.pdf',base64:Buffer.from('not a pdf').toString('base64')});assert.equal(r.status,400);
 r=await request('/api/documents/parse','POST',{name:'test.exe',base64:'YQ=='});assert.equal(r.status,400);
});

test('HTML 看板独立包含样式、真实进度及已排版建议，排除密钥与文档原文',async()=>{
 const p=await(await request('/api/projects','POST',{name:'导出测试<script>alert(1)</script>',customer:'虚构客户',background:'中文项目背景',actions:[{title:'确认需求',status:'已完成',owner:'我'},{title:'安排POC',status:'待开始'}],analyses:[{date:'2026-10-28',text:'# 项目判断\n需求明确\n## 下一步行动\n- **确认预算**\n- 安排测试'}],documents:[{name:'test.txt',text:'不应出现在导出表的完整正文',uploadedAt:'2026-10-28'}]})).json();
 const r=await request('/api/projects/'+p.id+'/dashboard');assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/text\/html/);assert.match(r.headers.get('content-disposition'),/\.html/);assert.match(r.headers.get('content-security-policy'),/script-src 'none'/);const html=await r.text();assert.match(html,/<!doctype html>/);assert.match(html,/<style>/);assert.match(html,/50<em>%/);assert.match(html,/<strong>确认预算<\/strong>/);assert.match(html,/项目判断/);assert.match(html,/下一步行动/);assert.doesNotMatch(html,/<script|<link|\*\*确认预算|不应出现在导出表的完整正文|fake-test-key-only/);assert.match(html,/&lt;script&gt;/);
 assert.equal((await request('/api/projects/'+p.id+'/excel')).status,404);
 await request('/api/projects/'+p.id,'DELETE');
});

test('Markdown 标题、嵌套列表、表格和代码可读；HTML 与远程图片不可执行',()=>{
 const html=renderMarkdown('# 标题\n\n- **重点**\n  - 嵌套行动\n\n| 负责人 | 动作 |\n| --- | --- |\n| 我 | 核实预算 |\n\n```js\nconst n = 1;\n```\n\n<script>alert(1)</script>\n\n![跟踪图片](https://evil.example/pixel)\n\n[点击](javascript:alert(1))');
 assert.match(html,/<h3>标题<\/h3>/);assert.match(html,/<strong>重点<\/strong>/);assert.match(html,/<table>/);assert.match(html,/嵌套行动/);assert.match(html,/<pre><code>/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script|<img|<a\s|src=|href=/);
 const cards=renderAnalysis('## 项目判断\n事实说明\n\n**下一步行动**\n1. 安排测试\n2. 核实预算\n\n## 风险\n- 兼容性未知');assert.match(cards,/advice-action/);assert.match(cards,/advice-risk/);assert.match(cards,/<ol start="1">/);assert.doesNotMatch(cards,/\*\*下一步行动\*\*/);
 const boldIntro=renderAnalysis('## 项目判断\n**第一句为加粗摘要**\n\n普通正文');assert.match(boldIntro,/<h3>项目判断<\/h3>/);assert.match(boldIntro,/<strong>第一句为加粗摘要<\/strong>/);
});



