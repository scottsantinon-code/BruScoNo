const FINANCIAL = new Set(['timeEntries','payments','expenses']);
export async function connectBackend(config) {
  if(config.mode === 'demo') return demoBackend();
  if(!['emulator','production'].includes(config.mode)) throw Error('Unsupported mode.');
  if(config.mode==='production') {
    if(config.productionApproved!==true||config.legacyAttributionConfirmed!==true||config.migrationReady!==true) throw Error('Production release is disabled pending explicit approval, legacy attribution and verified migration.');
    if(!config.projectId||config.projectId.startsWith('demo-')||/PLACEHOLDER|YOUR_|REPLACE/i.test(JSON.stringify(config.firebase||{}))||config.firebase?.projectId!==config.projectId||!config.firebase?.apiKey||!config.firebase?.authDomain) throw Error('Reviewed production Firebase configuration is missing.');
  } else {
    if(!config.projectId.startsWith('demo-')||config.firebase?.projectId!==config.projectId) throw Error('Emulator mode requires a matching demo- project ID.');
    if(!['127.0.0.1','localhost'].includes(config.firestoreEmulatorHost)) throw Error('Only local emulator hosts are allowed.');
    if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(config.authEmulator)) throw Error('Only local Auth emulator is allowed.');
  }
  const {A,F,H}=await import('./vendor/firebase-sdk.js');
  const app=A.initializeApp(config.firebase);const db=F.getFirestore(app),auth=H.initializeAuth(app,{persistence:H.browserLocalPersistence,popupRedirectResolver:H.browserPopupRedirectResolver});
  if(config.mode==='emulator'){
    F.connectFirestoreEmulator(db,config.firestoreEmulatorHost,config.firestoreEmulatorPort);
    H.connectAuthEmulator(auth,config.authEmulator,{disableWarnings:true});
  }
  // Persistence is selected at initialization so cross-tab listeners use the same storage.
  let user=null, member=null, authGeneration=0, sessionEpoch=0, memberUnsubscribe=null;
  const path=name=>FINANCIAL.has(name)||['workers','members'].includes(name)?`householdV2/main/${name}`:name;
  const validMember=()=>member?.active&&['admin','worker','agent'].includes(member.role)&&(member.role!=='worker'||['amy','ella'].includes(member.workerId));
  const requireMember=()=>{if(!user||!validMember())throw Error('Please sign in with an approved household account.');};
  const api={
    mode:config.mode,
    watchAuth(callback){const stop=H.onAuthStateChanged(auth,next=>{const generation=++authGeneration;++sessionEpoch;memberUnsubscribe?.();memberUnsubscribe=null;user=next;member=null;if(!next){callback(null,null);return;}callback(next,null,{message:'Checking access…'});memberUnsubscribe=F.onSnapshot(F.doc(db,path('members'),next.uid),{includeMetadataChanges:true},s=>{if(generation!==authGeneration)return;++sessionEpoch;if(s.metadata.fromCache||s.metadata.hasPendingWrites){member=null;callback(user,null,{message:'Checking access… Connect to the internet to verify household access.'});return;}member=s.exists()?s.data():null;callback(user,member);},e=>{if(generation===authGeneration){++sessionEpoch;member=null;callback(user,null,e);}});});return()=>{stop();memberUnsubscribe?.();};},
    timestamp:()=>F.serverTimestamp(),
    login:(email,password)=>config.mode==='emulator'?H.signInWithEmailAndPassword(auth,email,password):Promise.reject(Error('Use Google sign-in for the household app.')),
    googleLogin:()=>config.mode==='production'?H.signInWithPopup(auth,new H.GoogleAuthProvider().setCustomParameters({prompt:'select_account'})):Promise.reject(Error('Use a synthetic test account in the isolated emulator.')),
    logout:()=>H.signOut(auth),
    subscribe(name,callback,error){requireMember();const epoch=sessionEpoch;let q=F.collection(db,path(name));if(FINANCIAL.has(name)&&member.role==='worker')q=F.query(q,F.where('workerId','==',member.workerId));if(name==='workers'&&member.role==='worker')q=F.query(q,F.where(F.documentId(),'==',member.workerId));return F.onSnapshot(q,{includeMetadataChanges:true},s=>{if(epoch===sessionEpoch)callback(s.docs.map(d=>({...d.data(),id:d.id})),{fromCache:s.metadata.fromCache,hasPendingWrites:s.metadata.hasPendingWrites});},e=>{if(epoch===sessionEpoch)error?.(e);});},
    async add(name,data){requireMember();const payload={...data,createdAt:F.serverTimestamp()};if(FINANCIAL.has(name))Object.assign(payload,{schemaVersion:2,createdBy:user.uid,voided:false});else payload.createdBy=user.uid;return F.addDoc(F.collection(db,path(name)),payload);},
    async update(name,id,data){requireMember();return F.updateDoc(F.doc(db,path(name),id),{...data,updatedAt:F.serverTimestamp(),updatedBy:user.uid});},
    async remove(name,id){requireMember();if(FINANCIAL.has(name))return api.update(name,id,{voided:true});return F.deleteDoc(F.doc(db,path(name),id));}
  };return api;
}
function demoBackend(){
 let listener, user={uid:'demo-admin'}, member={active:true,role:'admin'},listeners={};
 const now=()=>new Date().toISOString();
 const data={workers:[{id:'amy',displayName:'Amy',hourlyRate:35},{id:'ella',displayName:'Ella',hourlyRate:35}],tasks:[{id:'task1',description:'Example shared household task',completed:false,createdAt:now()}],shopping:[],messages:[],timeEntries:[{id:'amy1',workerId:'amy',date:'2026-11-12',hours:4,rate:35,notes:'Synthetic sample only',createdAt:now()},{id:'old1',workerId:'legacy',date:'2026-10-20',hours:2,rate:35,notes:'Synthetic legacy record; original attribution unconfirmed',sourcePath:'demo/legacy',createdAt:now()}],payments:[{id:'pay1',workerId:'amy',date:'2026-11-12',amount:100,notes:'Synthetic payment record',createdAt:now()}],expenses:[]};
 const emit=name=>(listeners[name]||[]).forEach(fn=>fn(structuredClone(data[name])));
 const api={mode:'demo',watchAuth(fn){listener=fn;queueMicrotask(()=>fn(user,member));return()=>{};},login:async()=>{user={uid:'demo-admin'};member={active:true,role:'admin'};listener(user,member);},googleLogin:async()=>{user={uid:'demo-admin'};member={active:true,role:'admin'};listener(user,member);},timestamp:now,logout:async()=>{user=null;member=null;listener(null,null);},subscribe(name,cb){(listeners[name]??=[]).push(cb);queueMicrotask(()=>emit(name));return()=>{listeners[name]=listeners[name].filter(x=>x!==cb);};},async add(name,payload){const id=crypto.randomUUID();data[name].unshift({...payload,id,createdAt:now(),createdBy:'demo-admin',schemaVersion:2,voided:false});emit(name);return{id};},async update(name,id,patch){Object.assign(data[name].find(x=>x.id===id),patch);emit(name);},async remove(name,id){if(FINANCIAL.has(name))await api.update(name,id,{voided:true});else{data[name]=data[name].filter(x=>x.id!==id);emit(name);}}};return api;
}
