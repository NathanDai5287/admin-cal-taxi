const panel=document.querySelector('.preview');
const receipt=document.querySelector('.preview img');
const panelName=document.querySelector('.preview-head strong');
const panelMerchant=document.querySelector('.preview-foot span');
const panelAmount=document.querySelector('.preview-foot strong');
const variant=document.body.dataset.variant;
let activeRow;

function receiptImage(merchant, amount, date){
  const esc=(value)=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="850" viewBox="0 0 640 850"><rect width="640" height="850" fill="#fffefa"/><g font-family="Arial,sans-serif" fill="#272727"><text x="320" y="94" text-anchor="middle" font-size="34" font-weight="700">${esc(merchant.toUpperCase())}</text><text x="320" y="132" text-anchor="middle" font-size="17" fill="#666">123 College Avenue · Berkeley, CA</text><text x="56" y="214" font-size="18">${esc(date)}</text><text x="584" y="214" text-anchor="end" font-size="18">Receipt #05421</text><path d="M56 246h528" stroke="#bbb" stroke-dasharray="5 5"/><text x="56" y="294" font-size="20">Items</text><text x="584" y="294" text-anchor="end" font-size="20">Amount</text><path d="M56 315h528" stroke="#bbb"/><text x="56" y="368" font-size="21">Chapter supplies</text><text x="584" y="368" text-anchor="end" font-size="21">${esc(amount)}</text><text x="56" y="414" font-size="18" fill="#666">Qty 1</text><path d="M56 558h528" stroke="#bbb"/><text x="56" y="610" font-size="20">Subtotal</text><text x="584" y="610" text-anchor="end" font-size="20">${esc(amount)}</text><path d="M56 642h528" stroke="#272727"/><text x="56" y="698" font-size="25" font-weight="700">TOTAL</text><text x="584" y="698" text-anchor="end" font-size="25" font-weight="700">${esc(amount)}</text><text x="320" y="788" text-anchor="middle" font-size="17" fill="#777">Thank you for your purchase</text></g></svg>`;
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}

function show(row){
  activeRow?.classList.remove('is-active');
  activeRow=row;
  row.classList.add('is-active');
  const bounds=row.getBoundingClientRect();
  const panelHeight=variant==='c'?580:variant==='b'?370:478;
  if(variant!=='d')panel.style.top=Math.max(16,Math.min(bounds.top-18,innerHeight-panelHeight-16))+'px';
  if(variant==='b'){
    const expense=row.querySelector('.expense').getBoundingClientRect();
    panel.style.left=Math.min(innerWidth-266,expense.right+14)+'px';
  }
  panelName.textContent=row.dataset.name;
  panelMerchant.textContent=row.dataset.merchant;
  panelAmount.textContent=row.dataset.amount;
  receipt.src=receiptImage(row.dataset.merchant,row.dataset.amount,row.dataset.date);
  panel.hidden=false;
  panel.classList.add('has-receipt');
}
function hide(){activeRow?.classList.remove('is-active');activeRow=undefined;if(variant==='d'&&innerWidth>=1320)return;panel.hidden=true;panel.classList.remove('has-receipt');}
document.querySelectorAll('tbody tr').forEach(row=>{
  row.addEventListener('mouseenter',()=>show(row));
  row.addEventListener('mouseleave',hide);
  row.addEventListener('focusin',()=>show(row));
  row.addEventListener('focusout',event=>{if(!row.contains(event.relatedTarget))hide()});
});
if(new URLSearchParams(location.search).has('preview'))show(document.querySelector('tbody tr'));
else if(variant==='d'){panel.hidden=false;receipt.removeAttribute('src');}
