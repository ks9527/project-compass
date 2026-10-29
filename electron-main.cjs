const { app, BrowserWindow, dialog, utilityProcess, Menu, session } = require('electron');
const path=require('node:path');
const fs=require('node:fs');
let backend,window;
app.setName('项目指南针');
const testDir=process.env.WORKBENCH_DESKTOP_TEST_DIR;
if(testDir)app.setPath('userData',testDir);
// Use the standard per-user application-data location.
if(!app.requestSingleInstanceLock())app.quit();
else {
  app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.focus();}});
  app.whenReady().then(()=>{
    Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
    session.defaultSession.on('will-download',(_event,item)=>{
      const html=item.getFilename().endsWith('.html');
      item.setSaveDialogOptions({title:html?'保存项目分析看板':'保存项目备份',defaultPath:path.join(app.getPath('downloads'),item.getFilename()),filters:[{name:html?'HTML 项目看板':'JSON 备份',extensions:[html?'html':'json']}]});
    });
    const dataDir=path.join(app.getPath('userData'),'data');
    backend=utilityProcess.fork(path.join(__dirname,'server.mjs'),[],{env:{...process.env,PORT:'0',WORKBENCH_DATA_DIR:dataDir},serviceName:'项目指南针本地服务',stdio:'pipe'});
    let started=false;
    const timer=setTimeout(()=>{if(!started){dialog.showErrorBox('启动超时','本地服务未能启动，请重新打开软件。');app.quit();}},20000);
    backend.on('message',message=>{if(message?.type!=='ready'||started)return;started=true;clearTimeout(timer);const origin=message.origin;
      window=new BrowserWindow({width:1440,height:980,minWidth:1000,minHeight:720,title:'项目指南针',icon:path.join(__dirname,'public','icon.png'),backgroundColor:'#F3F7FC',show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
      window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
      window.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==origin)event.preventDefault();});
      window.webContents.on('will-prevent-unload',event=>{const leave=dialog.showMessageBoxSync(window,{type:'question',title:'退出工作台',message:'有未保存修改或正在分析的内容，确定退出？',buttons:['继续编辑','退出'],defaultId:0,cancelId:0});if(leave===1)event.preventDefault();});
      window.once('ready-to-show',()=>window.show());
      if(testDir){
        const log=message=>fs.appendFileSync(path.join(testDir,'ui-events.log'),message+'\n');
        window.once('ready-to-show',()=>log('ready-to-show'));
        window.webContents.once('did-finish-load',()=>log('did-finish-load'));
        window.webContents.on('render-process-gone',(_event,details)=>log('render-process-gone:'+details.reason));
      }
      window.loadURL(origin);
      if(testDir)fs.writeFileSync(path.join(testDir,'desktop-ready.json'),JSON.stringify({origin,electron:process.versions.electron,node:process.versions.node}));
    });
    backend.on('exit',()=>{clearTimeout(timer);if(!app.isQuitting){dialog.showErrorBox('本地服务已退出','请重新打开软件，已保存资料不受影响。');app.quit();}});
  }).catch(error=>{dialog.showErrorBox('无法启动工作台',error.message);app.quit();});
  app.on('before-quit',()=>{app.isQuitting=true;backend?.kill();});
  app.on('window-all-closed',()=>app.quit());
}
