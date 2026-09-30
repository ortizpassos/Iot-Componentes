// Checks the isolated service only; never submits a document to a printer.
const { resolve } = require('node:path');
process.loadEnvFile(resolve(__dirname, '../../.print-test.env'));
(async () => {
 const base = 'http://127.0.0.1:3001/api';
 const login = await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@teste.local',password:'TesteEtiqueta123!'})});
 if(!login.ok) throw Error('Login de teste falhou');
 const {accessToken}=await login.json();
 const headers={'Content-Type':'application/json','X-Print-Token':process.env.PRINT_MONITOR_TOKEN};
 const claim=await fetch(base+'/print-monitor/claim',{method:'POST',headers,body:'{}'});
 const job=await claim.json(); if(!job) throw Error('Nenhum pedido ficticio disponivel');
 try {
  const data=await fetch(base+'/print-monitor/'+job.id+'/data',{method:'POST',headers,body:JSON.stringify({token:job.token})});
  if(!data.ok) throw Error('Conversao PWG falhou: '+data.status);
  const bytes=Buffer.from(await data.arrayBuffer()); if(bytes.subarray(0,4).toString()!=='RaS2') throw Error('PWG invalido');
  console.log('API, login, fila e PWG aprovados: '+bytes.length+' bytes. Nenhuma impressao enviada.');
 } finally {
  const release=await fetch(base+'/admin/orders/'+job.id+'/retry-print',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+accessToken},body:'{}'});
  if(!release.ok) throw Error('Reserva de teste precisa de revisao');
 }
 const front=await fetch('http://127.0.0.1:4201/api/health');
 if(!front.ok) throw Error('Proxy frontend indisponivel');
 console.log('Frontend em http://localhost:4201/adm conectado a API de teste.');
})().catch(e=>{console.error(e.message);process.exitCode=1});
