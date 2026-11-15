const $=id=>document.getElementById(id);
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const money=n=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(n);
const titles={addTimeForm:'Log hours',addExpenseForm:'Add an expense',addPaymentForm:'Record a payment'};
export function setupMobile(switchTab){
 for(const [id,title] of Object.entries(titles)){
  const dialog=node('dialog',null,'entry-sheet');dialog.id='sheet-'+id;
  const head=node('div',null,'sheet-heading');head.append(node('h2',title));
  const close=node('button','×','btn-icon');close.type='button';close.setAttribute('aria-label','Close');close.onclick=()=>dialog.close();head.append(close);
  dialog.append(head,node('p','','sheet-person'));const error=node('p','','sheet-error');error.setAttribute('role','alert');dialog.append(error);const form=$(id);form.querySelectorAll('input').forEach(input=>{const label=node('label',input.getAttribute('aria-label')||input.placeholder,'field-label');input.before(label);label.append(input);});dialog.append(form);document.body.append(dialog);
  dialog.addEventListener('close',()=>{error.textContent='';if(id==='addTimeForm')$('timeCancelBtn').click();});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
 }
 document.querySelectorAll('[data-mobile-tab]').forEach(b=>b.onclick=()=>switchTab(b.dataset.mobileTab));
 document.querySelectorAll('[data-sheet]').forEach(b=>b.onclick=()=>$( 'sheet-'+b.dataset.sheet).showModal());
 $('workerSelect').addEventListener('change',()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
 $('homeDate').textContent=new Date().toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long'});
}
export function renderMobile({user,member,state,workerId,loaded,financialBusy,invalid,ready,validEntry,action,backend,switchTab}){
 const admin=member?.role==='admin',agent=member?.role==='agent';
 const name=member?.displayName||user?.displayName?.split(' ')[0]||(member?.workerId?member.workerId[0].toUpperCase()+member.workerId.slice(1):'');
 $('homeGreeting').textContent=name?'Hello, '+name+'.':'Our household';
 const open=state.tasks.filter(t=>!t.completed);
 $('homeSummary').textContent=loaded.has('tasks')?`${open.length} ${open.length===1?'thing':'things'} on the household list.`:'Checking household updates…';
 $('homePrimary').textContent=admin||agent?'Add task':'Log hours';$('homePrimary').onclick=()=>{if(admin||agent){switchTab('tasks');$('newTaskInput').focus();}else $('sheet-addTimeForm').showModal();};
 $('homeSecondary').textContent=admin?'Record payment':agent?'Shopping':'Add expense';$('homeSecondary').onclick=()=>agent?switchTab('shopping'):$(admin?'sheet-addPaymentForm':'sheet-addExpenseForm').showModal();
 $('homePrimary').disabled=!admin&&!agent&&financialBusy;$('homeSecondary').disabled=!agent&&financialBusy;
 $('recordPaymentShortcut').hidden=!admin;
 document.querySelector('.nav-btn[data-tab="payments"]').hidden=agent;
 $('homePayPeople').closest('section').hidden=agent;
 const list=$('homeTasks');list.replaceChildren();for(const task of open.slice(0,2)){
  const row=node('div',null,'task-item');const check=node('button','', 'checkbox');check.type='button';check.setAttribute('aria-label','Complete: '+task.description);
  check.onclick=()=>action('task:'+task.id,()=>backend.update('tasks',task.id,{completed:true,completedAt:backend.timestamp()}));row.append(check,node('span',task.description,'task-text'));list.append(row);
 }if(!open.length)list.append(node('p',loaded.has('tasks')?'All caught up.':'Loading tasks…','empty-state'));
 $('homeLatestNote').textContent=state.messages[0]?.text||(loaded.has('messages')?'No notes yet.':'Loading notes…');
 const pay=$('homePayPeople');pay.replaceChildren();for(const id of admin?['amy','ella']:member?.workerId?[member.workerId]:[]){
  const worker=state.workers.find(w=>w.id===id);const entries=k=>state[k].filter(e=>e.workerId===id&&!e.voided);
  const amount=entries('timeEntries').reduce((n,e)=>n+e.hours*e.rate,0)+entries('expenses').reduce((n,e)=>n+e.amount,0)-entries('payments').reduce((n,e)=>n+e.amount,0);
  const invalidWorker=['timeEntries','expenses','payments'].some(k=>entries(k).some(e=>!validEntry(k,e)));
  const row=node('button',null,'person-pay');row.type='button';const text=node('span');text.append(node('strong',worker?.displayName||id),node('small',Number.isFinite(worker?.hourlyRate)?money(worker.hourlyRate)+'/hour':'Checking rate…'));row.append(text,node('strong',!ready?'Checking…':invalidWorker||!Number.isFinite(amount)?'Review required':money(amount)));row.onclick=()=>{if(admin){$('workerSelect').value=id;$('workerSelect').dispatchEvent(new Event('change'));}switchTab('payments');};pay.append(row);
 }
 const combined=$('combinedActivity');combined.replaceChildren();const rows=[];
 for(const [id,label] of [['timeEntryList','Hours'],['expenseList','Expense'],['paymentList','Payment']])for(const child of Array.from($(id).children)){
  if(!child.classList.contains('entry-item'))continue;
  const date=child.querySelector('.entry-date')?.textContent||'';child.prepend(node('p',label,'activity-type'));rows.push({date,child});
 }
 rows.sort((a,b)=>b.date.localeCompare(a.date));combined.append(...rows.map(x=>x.child));
 if(!rows.length)combined.append(node('p',ready?'No entries for this person.':'Checking current history…','empty-state'));
 // Field disabling remains owned by the tested financial controller.
 document.querySelectorAll('[data-sheet]').forEach(b=>b.disabled=financialBusy||agent);
 document.querySelectorAll('.sheet-person').forEach(n=>n.textContent=state.workers.find(w=>w.id===workerId)?.displayName||workerId);
}
