import { test, expect } from '@playwright/test';
import { profile } from './checkout-fixture';
const id='507f1f77bcf86cd799439011', digital='507f1f77bcf86cd799439012', complete='507f1f77bcf86cd799439013', asset='507f1f77bcf86cd799439014';
const project={_id:id,name:'Controle de iluminacao',description:'Projeto pronto com ESP32',images:[],videoUrl:'',active:true,digitalPrice:25,completePrice:100,completeEnabled:true,stock:2,digitalProductId:digital,completeProductId:complete};
const freeId='507f1f77bcf86cd799439015';
const freeProject={...project,_id:freeId,name:'Sensor gratuito',isFree:true,digitalPrice:0,completeEnabled:false,owned:true};
const availableFirmware={instructions:'Conecte o sensor no GPIO 4.',firmware:[{name:'DevKit V1',chip:'ESP32',format:'MERGED',parts:[{assetId:asset,address:0}]}],assets:[]};
async function setup(page:any, handler?:any) {
 await page.addInitScript(() => sessionStorage.setItem('iot-token','test-token'));
 await page.route('**/api/**',async (route:any) => {
  const path=new URL(route.request().url()).pathname;
  if(handler && await handler(route,path)) return;
  if(path==='/api/users/me') return route.fulfill({json:{name:'Cliente',role:'CUSTOMER'}});
  if(path==='/api/cart') return route.fulfill({json:{lines:[]}});
  if(path==='/api/users/me/checkout-profile') return route.fulfill({json:{profile}});
  if(path==='/api/project-store') return route.fulfill({json:[project]});
  if(path==='/api/project-store/mine') return route.fulfill({json:[]});
  if(path==='/api/project-store/'+id) return route.fulfill({json:{...project,owned:false}});
  if(path==='/api/products') return route.fulfill({json:[{_id:digital,name:'Projeto digital',sku:'D',type:'SERVICE',price:25,stock:100,storeProjectId:id,deliveryKind:'DIGITAL'},{_id:complete,name:'Dispositivo gravado',sku:'C',type:'KIT',price:100,stock:2,storeProjectId:id,deliveryKind:'PHYSICAL'}]});
  if(path==='/api/shipping/quote') return route.fulfill({json:{services:[{code:'1',name:'PAC',price:10,deliveryDays:4}]}});
  return route.fulfill({json:{items:[],total:0}});
 });
}
test('customer sees catalog, cannot create projects and digital purchase has no freight',async({page})=>{
 let body:any;
 await setup(page,async(route:any,path:string)=>{if(path==='/api/orders'){body=route.request().postDataJSON();await route.fulfill({json:{_id:id,items:body.items}});return true;}return false;});
 await page.goto('/projetos');
 await expect(page.getByRole('heading',{name:'Projetos disponíveis'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Criar projeto'})).toHaveCount(0);
 await page.getByRole('link',{name:'Ver detalhes e opções'}).click();
 await expect(page.getByRole('heading',{name:'Gravar no meu ESP32'})).toHaveCount(0);
 await page.getByRole('link',{name:'Comprar projeto digital'}).click();
 await expect(page.getByRole('button',{name:'Alterar dados de entrega'})).toBeVisible();
 await expect(page.getByRole('radio',{name:/PAC/})).toHaveCount(0);
 await page.getByRole('button',{name:/Ir para pagamento/}).click();
 await expect(page).toHaveURL('/pagamento/'+id);
 expect(body.shippingServiceId).toBeUndefined(); expect(body.items[0].productId).toBe(digital);
});
test('complete purchase includes shipping and preserves the chosen offer',async({page})=>{
 let body:any;
 await setup(page,async(route:any,path:string)=>{if(path==='/api/orders'){body=route.request().postDataJSON();await route.fulfill({json:{_id:id,items:body.items}});return true;}return false;});
 await page.goto('/projetos/'+id);
 await page.getByRole('link',{name:'Comprar dispositivo completo'}).click();
 await expect(page.getByRole('radio',{name:/PAC/})).toBeVisible();
 await page.getByRole('button',{name:/Ir para pagamento/}).click();
 await expect(page).toHaveURL('/pagamento/'+id);
 expect(body.shippingServiceId).toBe('1');expect(body.items[0].productId).toBe(complete);
});
test('paid project exposes instructions and requires confirmation before selecting COM port',async({page})=>{
 await setup(page,async(route:any,path:string)=>{if(path==='/api/project-store/'+id){await route.fulfill({json:{...project,owned:true,instructions:'Conecte o sensor no GPIO 4.',firmware:[{name:'DevKit V1',chip:'ESP32',format:'MERGED',parts:[{assetId:asset,address:0}]}],assets:[]}});return true;}return false;});
 await page.addInitScript(()=>{Object.defineProperty(navigator,'serial',{configurable:true,value:{requestPort:async()=>{(window as any).portRequests=((window as any).portRequests||0)+1;throw new DOMException('Porta não selecionada','NotFoundError');}}});});
 await page.goto('/projetos/'+id);
 await expect(page.getByText('Conecte o sensor no GPIO 4.')).toBeVisible();
 await expect(page.locator('.notice').filter({hasText:/Placa/})).toContainText('ESP32');
 await page.getByRole('button',{name:'Conectar e gravar projeto'}).click();
 expect(await page.evaluate(()=>(window as any).portRequests||0)).toBe(0);
 await page.getByRole('button',{name:'Confirmar alteração'}).click();
 await expect(page.getByRole('alert')).toContainText('Porta não selecionada');
 expect(await page.evaluate(()=>(window as any).portRequests)).toBe(1);
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
test('administrator uploads firmware and saves a sellable project',async({page})=>{
 let saved:any;
 await setup(page,async(route:any,path:string)=>{
  if(path==='/api/admin/access'){await route.fulfill({json:{allowed:true}});return true;}
  if(path==='/api/admin/packages'){await route.fulfill({json:[]});return true;}
  if(path==='/api/admin/project-store'){if(route.request().method()==='POST'){saved=route.request().postDataJSON();await route.fulfill({json:{...saved,_id:id}});}else await route.fulfill({json:[]});return true;}
  if(path==='/api/admin/project-store/assets/bin'){expect(route.request().headers()['authorization']).toBe('Bearer test-token');await route.fulfill({json:{_id:asset,name:'merged.bin',kind:'bin',detectedChip:'ESP32'}});return true;}
  return false;
 });
 await page.goto('/adm');await page.getByRole('button',{name:'Projetos',exact:true}).click();
 await page.getByRole('button',{name:'Cadastrar projeto'}).click();
 await expect(page.getByRole('dialog',{name:'Novo projeto'})).toBeVisible();
 await expect(page.getByLabel('Código do projeto')).toBeVisible();
 await page.getByLabel('Nome do projeto',{exact:true}).fill('Controle de iluminacao');
 await page.getByLabel('Descrição do anúncio').fill('Projeto com ESP32');
 await expect(page.getByLabel('Formato')).toHaveCount(0);
 await expect(page.getByLabel(/Endereço na flash/)).toHaveCount(0);
 await page.getByLabel('Descrição da versão').fill('Primeira versão estável');
 await page.getByLabel('Arquivo .bin').setInputFiles({name:'merged.bin',mimeType:'application/octet-stream',buffer:Buffer.from([233,0,0,0])});
 await expect(page.locator('p').filter({hasText:'Arquivo preservado.'})).toBeVisible();
 await page.getByRole('button',{name:'Atualizar firmware'}).click();
 await page.getByLabel('Descrição da versão').nth(1).fill('Correção da conexão Wi-Fi');
 await page.getByLabel('Arquivo .bin').setInputFiles({name:'merged-v2.bin',mimeType:'application/octet-stream',buffer:Buffer.from([233,0,0,0])});
 await expect(page.locator('p').filter({hasText:'Arquivo preservado.'})).toHaveCount(2);
 await page.getByLabel('Publicado no catálogo de projetos').check();
 await page.getByRole('button',{name:'Salvar projeto',exact:true}).click();
 await expect(page.getByText('Projeto salvo.',{exact:true})).toBeVisible();
 expect(saved.firmware).toHaveLength(2);expect(saved.firmware[0].parts).toEqual([{assetId:asset,address:0}]);expect(saved.firmware[0].description).toBe('Primeira versão estável');expect(saved.firmware[1].description).toBe('Correção da conexão Wi-Fi');expect(saved.active).toBe(true);
});

test('customer selects a preserved firmware version and sees its description',async({page})=>{
 const versions=[
  {name:'Versão 1',description:'Versão inicial estável',chip:'ESP32',format:'MERGED',parts:[{assetId:asset,address:0}]},
  {name:'Versão 2',description:'Melhora a conexão Wi-Fi',chip:'ESP32',format:'MERGED',parts:[{assetId:asset,address:0}]},
 ];
 await setup(page,async(route:any,path:string)=>{if(path==='/api/project-store/'+id){await route.fulfill({json:{...project,owned:true,instructions:'codigo',firmware:versions,assets:[]}});return true;}return false;});
 await page.goto('/projetos/'+id);
 await expect(page.getByRole('button',{name:'Conectar e gravar projeto'})).toBeDisabled();
 await page.getByRole('combobox',{name:'Versão do firmware'}).selectOption('1');
 await expect(page.locator('.notice')).toContainText('Melhora a conexão Wi-Fi');
 await expect(page.getByText(/Placa necessária/)).toBeVisible();
});

test('expired firmware download returns to login and never opens the serial port',async({page})=>{
 await setup(page,async(route:any,path:string)=>{
  if(path==='/api/project-store/'+id){await route.fulfill({json:{...project,owned:true,firmware:[{name:'DevKit V1',chip:'ESP32',format:'MERGED',parts:[{assetId:asset,address:0}]}],assets:[{_id:asset,kind:'bin',name:'merged.bin',size:1,sha256:''}]}});return true;}
  if(path==='/api/project-store/'+id+'/assets/'+asset){expect(route.request().headers()['authorization']).toBe('Bearer test-token');await route.fulfill({status:401,json:{message:'Unauthorized',statusCode:401}});return true;}return false;
 });
 await page.addInitScript(()=>Object.defineProperty(navigator,'serial',{configurable:true,value:{requestPort:async()=>({open:async()=>{(window as any).serialOpened=true;}})}}));
 await page.goto('/projetos/'+id);
 await page.getByRole('button',{name:'Conectar e gravar projeto'}).click();
 await page.getByRole('button',{name:'Confirmar altera\u00e7\u00e3o'}).click();
 await expect(page).toHaveURL(new RegExp('/login\\?expired=1&returnUrl='));
 expect(new URL(page.url()).searchParams.get('returnUrl')).toBe('/projetos/'+id);
 expect(await page.evaluate(()=>(window as any).serialOpened||false)).toBe(false);
 expect(await page.evaluate(()=>sessionStorage.getItem('iot-token'))).toBeNull();
});

test('free catalog project opens directly inside Meu Lab without a purchase',async({page})=>{
 let orders=0;
 await setup(page,async(route:any,path:string)=>{
  if(path==='/api/project-store'){await route.fulfill({json:[project,freeProject]});return true;}
  if(path==='/api/project-store/mine'){await route.fulfill({json:[freeProject]});return true;}
  if(path==='/api/project-store/'+freeId){await route.fulfill({json:{...freeProject,...availableFirmware}});return true;}
  if(path==='/api/orders'){orders++;await route.fulfill({json:{}});return true;}
  return false;
 });
 await page.goto('/projetos');
 await expect(page.getByRole('heading',{name:'Grátis',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Pagos',exact:true})).toBeVisible();
 await expect(page.locator('article').filter({hasText:project.name}).getByRole('link',{name:'Ver detalhes e opções'})).toBeVisible();
 await page.locator('article').filter({hasText:freeProject.name}).getByRole('link',{name:'Abrir no Meu Lab'}).click();
 await expect(page).toHaveURL(new RegExp('/meu-lab\\?projeto='+freeId+'$'));
 await expect(page.getByRole('heading',{name:'Gravar no meu ESP32'})).toBeVisible();
 await expect(page.getByText(availableFirmware.instructions,{exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'Comprar projeto digital'})).toHaveCount(0);
 expect(orders).toBe(0);
});

test('Meu Lab separates automatic free projects from purchased paid projects and keeps flashing on the page',async({page})=>{
 const unpaid={...project,_id:'507f1f77bcf86cd799439016',name:'Projeto ainda não comprado',isFree:false};
 await setup(page,async(route:any,path:string)=>{
  if(path==='/api/project-store'){await route.fulfill({json:[freeProject,project,unpaid]});return true;}
  if(path==='/api/project-store/mine'){await route.fulfill({json:[freeProject,{...project,owned:true}]});return true;}
  if(path==='/api/project-store/'+freeId){await route.fulfill({json:{...freeProject,...availableFirmware}});return true;}
  return false;
 });
 await page.addInitScript(()=>Object.defineProperty(navigator,'serial',{configurable:true,value:{requestPort:async()=>{(window as any).portRequests=((window as any).portRequests||0)+1;throw new DOMException('Porta não selecionada','NotFoundError');}}}));
 await page.goto('/meu-lab');
 const free=page.getByRole('region',{name:'Grátis',exact:true});
 const paid=page.getByRole('region',{name:'Pagos',exact:true});
 await expect(free.getByText(freeProject.name,{exact:true})).toBeVisible();
 await expect(paid.getByText(project.name,{exact:true})).toBeVisible();
 await expect(free.getByText(project.name,{exact:true})).toHaveCount(0);
 await expect(paid.getByText(freeProject.name,{exact:true})).toHaveCount(0);
 await expect(page.getByText(unpaid.name,{exact:true})).toHaveCount(0);
 await free.getByRole('button',{name:'Abrir no Meu Lab'}).click();
 await expect(page.getByText(availableFirmware.instructions,{exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Gravar no meu ESP32'})).toBeVisible();
 expect(new URL(page.url()).pathname).toBe('/meu-lab');
 await expect(page.locator('.notice').filter({hasText:/Placa/})).toContainText('ESP32');
 await page.getByRole('button',{name:'Conectar e gravar projeto'}).click();
 await expect(page.getByRole('dialog',{name:'Confirmar ação'})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).portRequests||0)).toBe(0);
 await page.getByRole('button',{name:'Confirmar alteração'}).click();
 await expect(page.getByRole('alert')).toContainText('Porta não selecionada');
 expect(await page.evaluate(()=>(window as any).portRequests)).toBe(1);
 expect(new URL(page.url()).pathname).toBe('/meu-lab');
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('free project details offer lab access instead of digital checkout',async({page})=>{
 await setup(page,async(route:any,path:string)=>{
  if(path==='/api/project-store/'+freeId){await route.fulfill({json:{...freeProject,...availableFirmware}});return true;}
  return false;
 });
 await page.goto('/projetos/'+freeId);
 await expect(page.getByRole('heading',{name:freeProject.name,exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'Comprar projeto digital'})).toHaveCount(0);
 await expect(page.getByRole('link',{name:'Abrir no Meu Lab'})).toHaveAttribute('href','/meu-lab?projeto='+freeId);
});

test('expired free firmware download preserves Meu Lab as the login return URL',async({page})=>{
 await setup(page,async(route:any,path:string)=>{
  if(path==='/api/project-store/mine'){await route.fulfill({json:[freeProject]});return true;}
  if(path==='/api/project-store/'+freeId){await route.fulfill({json:{...freeProject,...availableFirmware,assets:[{_id:asset,kind:'bin',name:'merged.bin',size:1,sha256:''}]}});return true;}
  if(path==='/api/project-store/'+freeId+'/assets/'+asset){expect(route.request().headers()['authorization']).toBe('Bearer test-token');await route.fulfill({status:401,json:{message:'Unauthorized',statusCode:401}});return true;}
  return false;
 });
 await page.addInitScript(()=>Object.defineProperty(navigator,'serial',{configurable:true,value:{requestPort:async()=>({open:async()=>{(window as any).serialOpened=true;}})}}));
 await page.goto('/meu-lab?projeto='+freeId);
 await page.getByRole('button',{name:'Conectar e gravar projeto'}).click();
 await page.getByRole('button',{name:'Confirmar alteração'}).click();
 await expect(page).toHaveURL(new RegExp('/login\\?expired=1&returnUrl='));
 expect(new URL(page.url()).searchParams.get('returnUrl')).toBe('/meu-lab?projeto='+freeId);
 expect(await page.evaluate(()=>(window as any).serialOpened||false)).toBe(false);
 expect(await page.evaluate(()=>sessionStorage.getItem('iot-token'))).toBeNull();
});

test('administrator publishes a free project with no digital payment price',async({page})=>{
 let saved:any;
 await setup(page,async(route:any,path:string)=>{
  if(path==='/api/admin/access'){await route.fulfill({json:{allowed:true}});return true;}
  if(path==='/api/admin/project-store'){if(route.request().method()==='POST'){saved=route.request().postDataJSON();await route.fulfill({json:{...saved,_id:freeId}});}else await route.fulfill({json:[]});return true;}
  if(path==='/api/admin/project-store/assets/bin'){await route.fulfill({json:{_id:asset,name:'merged.bin',kind:'bin',detectedChip:'ESP32'}});return true;}
  return false;
 });
 await page.goto('/adm');
 await page.getByRole('button',{name:'Projetos',exact:true}).click();
 await page.getByRole('button',{name:'Cadastrar projeto'}).click();
 await expect(page.getByRole('dialog',{name:'Novo projeto'})).toBeVisible();
 await page.getByLabel('Nome do projeto',{exact:true}).fill(freeProject.name);
 await page.getByLabel('Descrição do anúncio').fill('Projeto gratuito para o laboratório');
 await page.getByLabel('Categoria do projeto').selectOption({label:'Grátis'});
 await expect(page.getByLabel('Preço apenas do projeto (R$)')).toHaveCount(0);
 await page.getByLabel('Arquivo .bin').setInputFiles({name:'merged.bin',mimeType:'application/octet-stream',buffer:Buffer.from([233,0,0,0])});
 await expect(page.locator('p').filter({hasText:'Arquivo preservado.'})).toBeVisible();
 await expect(page.locator('p').filter({hasText:/Placa detectada/})).toContainText('ESP32');
 await page.getByLabel('Publicado no catálogo de projetos').check();
 await page.getByRole('button',{name:'Salvar projeto',exact:true}).click();
 await expect(page.getByText('Projeto salvo.',{exact:true})).toBeVisible();
 expect(saved.isFree).toBe(true);
 expect(saved.digitalPrice).toBe(0);
 expect(saved.active).toBe(true);
});

test('busy lab keeps the project mounted and blocks navigation while choosing the serial port',async({page})=>{
 await setup(page,async(route:any,path:string)=>{
  if(path==='/api/project-store/mine'){await route.fulfill({json:[freeProject,{...project,owned:true}]});return true;}
  if(path==='/api/project-store/'+freeId){await route.fulfill({json:{...freeProject,...availableFirmware}});return true;}
  return false;
 });
 await page.addInitScript(()=>Object.defineProperty(navigator,'serial',{configurable:true,value:{requestPort:()=>new Promise((_resolve,reject)=>{(window as any).cancelPortSelection=()=>reject(new DOMException('Porta não selecionada','NotFoundError'));})}}));
 await page.goto('/meu-lab?projeto='+freeId);
 await page.getByRole('button',{name:'Conectar e gravar projeto'}).click();
 await page.getByRole('button',{name:'Confirmar alteração'}).click();
 await expect(page.getByRole('button',{name:'Fechar projeto'})).toBeDisabled();
 const projectButtons=page.getByRole('button',{name:'Abrir no Meu Lab'});
 await expect(projectButtons).toHaveCount(2);
 await expect(projectButtons.nth(0)).toBeDisabled();
 await expect(projectButtons.nth(1)).toBeDisabled();
 await page.getByRole('link',{name:/Catálogo/}).click();
 await expect(page).toHaveURL('/meu-lab?projeto='+freeId);
 await expect(page.getByRole('heading',{name:'Gravar no meu ESP32'})).toBeVisible();
 await page.evaluate(()=>(window as any).cancelPortSelection());
 await expect(page.getByRole('alert')).toContainText('Porta não selecionada');
 await expect(page.getByRole('button',{name:'Fechar projeto'})).toBeEnabled();
 await page.getByRole('link',{name:/Catálogo/}).click();
 await expect(page).toHaveURL('/catalogo');
});
