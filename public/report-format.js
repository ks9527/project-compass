import { lexer } from './vendor/marked.js';

export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const e=escapeHtml;
function inline(tokens=[]){return tokens.map(token=>{
  const content=()=>token.tokens?inline(token.tokens):e(token.text||'');
  switch(token.type){
    case 'strong':return `<strong>${content()}</strong>`;
    case 'em':return `<em>${content()}</em>`;
    case 'del':return `<del>${content()}</del>`;
    case 'codespan':return `<code>${e(token.text)}</code>`;
    case 'br':return '<br>';
    // Never load remote images or activate model-provided URLs.
    case 'image':return `<span class="md-source">图片说明：${e(token.text)}</span>`;
    case 'link':return `<span class="md-source" title="${e(token.href)}">${content()}</span>`;
    default:return content();
  }
}).join('');}
function blocks(tokens=[]){return tokens.map(token=>{
  switch(token.type){
    case 'space':return '';
    case 'heading':{const h=Math.min(6,token.depth+2);return `<h${h}>${inline(token.tokens)}</h${h}>`;}
    case 'paragraph':return `<p>${inline(token.tokens)}</p>`;
    case 'text':return token.tokens?inline(token.tokens):e(token.text);
    case 'hr':return '<hr>';
    case 'blockquote':return `<blockquote>${blocks(token.tokens)}</blockquote>`;
    case 'code':return `<div class="md-code"><span>${e(token.lang||'代码 / 原文')}</span><pre><code>${e(token.text)}</code></pre></div>`;
    case 'list':{const tag=token.ordered?'ol':'ul';return `<${tag}${token.ordered?` start="${Number(token.start)||1}"`:''}>${token.items.map(item=>`<li>${item.task?`<span class="md-check">${item.checked?'✓':'○'}</span>`:''}${blocks(item.tokens)}</li>`).join('')}</${tag}>`;}
    case 'table':return `<div class="md-table"><table><thead><tr>${token.header.map(cell=>`<th>${inline(cell.tokens)}</th>`).join('')}</tr></thead><tbody>${token.rows.map(row=>`<tr>${row.map(cell=>`<td>${inline(cell.tokens)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    default:return `<p>${e(token.text||token.raw||'')}</p>`;
  }
}).join('');}
export function renderMarkdown(text){return `<div class="ai-markdown">${blocks(lexer(String(text||''),{gfm:true,breaks:true}))}</div>`;}
function heading(token){
  if(token.type==='heading')return token.text.replace(/\*|`/g,'').trim();
  if(token.type==='paragraph'){
    const parts=(token.tokens||[]).filter(t=>t.type!=='text'||t.text.trim());
    if(parts.length===1&&parts[0].type==='strong')return parts[0].text;
  }
  return null;
}
export function renderAnalysis(text){
  const tokens=lexer(String(text||''),{gfm:true,breaks:true});const groups=[];let current={title:'分析摘要',tokens:[]};
  for(const token of tokens){let title=heading(token);if(token.type==='paragraph'&&current.title!=='分析摘要'&&!current.tokens.some(t=>t.type!=='space'))title=null;if(title){if(current.tokens.some(t=>t.type!=='space'))groups.push(current);current={title,tokens:[]};}else current.tokens.push(token);}
  if(current.title!=='分析摘要'||current.tokens.some(t=>t.type!=='space'))groups.push(current);
  return `<div class="advice-grid">${groups.map((group,i)=>{const type=/风险|障碍|问题/.test(group.title)?'risk':/行动|下一步|计划|推进|7天|七天/.test(group.title)?'action':/机会|价值/.test(group.title)?'opportunity':'insight';return `<section class="advice-card advice-${type}"><div class="advice-title"><span>${String(i+1).padStart(2,'0')}</span><h3>${e(group.title)}</h3></div><div class="ai-markdown">${blocks(group.tokens)}</div></section>`;}).join('') || '<p class="report-empty">暂无分析内容</p>'}</div>`;
}
