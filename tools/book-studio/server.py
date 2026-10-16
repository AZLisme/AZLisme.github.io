import hashlib,hmac,json,os,re,secrets,sqlite3,threading,time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI,File,UploadFile,Form,Header,HTTPException,Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse,JSONResponse
from PIL import Image,ImageOps,UnidentifiedImageError
from pipeline import configured,process
ROOT=Path(os.getenv('STUDIO_DATA','./data')).resolve();ROOT.mkdir(parents=True,exist_ok=True)
DB=ROOT/'studio.sqlite3';pool=ThreadPoolExecutor(max_workers=1);lock=threading.Lock()
def db():
 c=sqlite3.connect(DB);c.row_factory=sqlite3.Row;return c
def init():
 with db() as c:
  c.execute('CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,owner TEXT,ip TEXT,token TEXT,title TEXT,state TEXT,detail TEXT,current INTEGER,total INTEGER,created REAL)')
  c.execute("UPDATE jobs SET state='failed',detail='生成服务重启，请重新提交照片。' WHERE state IN ('uploading','queued','recognizing','voicing','packaging')")
init()
app=FastAPI(title='寻宝绘本制作服务',docs_url=None,redoc_url=None)
origins=[x.strip() for x in os.getenv('STUDIO_ORIGINS','http://localhost:8765').split(',')]
app.add_middleware(CORSMiddleware,allow_origins=origins,allow_methods=['GET','POST'],allow_headers=['Authorization','Content-Type','X-Studio-Code'])
def owner(authorization):
 if not authorization or not re.fullmatch(r'Bearer [a-f0-9]{64}',authorization):raise HTTPException(401,'制作身份已失效，请重新打开页面。')
 return hashlib.sha256(authorization.encode()).hexdigest()
def getjob(jid,authorization):
 with db() as c:r=c.execute('SELECT * FROM jobs WHERE id=? AND owner=?',(jid,owner(authorization))).fetchone()
 if not r:raise HTTPException(404,'找不到该任务。')
 return dict(r)
def update(jid,state,detail,current=0,total=0):
 with db() as c:c.execute('UPDATE jobs SET state=?,detail=?,current=?,total=? WHERE id=?',(state,detail,current,total,jid))
def run(jid,title):
 try:process(ROOT/jid,title,'user-'+jid,lambda state,i,n,msg:update(jid,state,msg,i,n));update(jid,'ready','生成完成，请校对后加入书架。',len(list((ROOT/jid/'input').glob('*.jpg'))),len(list((ROOT/jid/'input').glob('*.jpg'))))
 except Exception as e:
  # Never return upstream errors containing URLs, prompts or credentials.
  detail=str(e) if isinstance(e,ValueError) else '生成服务暂时出错，照片草稿仍保留，可稍后重新提交。'
  update(jid,'failed',detail[:240])
def enabled():return configured() and bool(os.getenv('STUDIO_ACCESS_CODE') or os.getenv('STUDIO_ALLOW_PUBLIC')=='1')
@app.get('/health')
def health():return {'ready':enabled(),'requiresCode':bool(os.getenv('STUDIO_ACCESS_CODE')),'maxPages':40,'message':'可以开始生成' if enabled() else '生成服务尚未配置，照片可以先保存为草稿。'}
@app.post('/jobs')
async def create(request:Request,title:str=Form(...),photos:list[UploadFile]=File(...),authorization:str|None=Header(None),x_studio_code:str|None=Header(None)):
 own=owner(authorization)
 if not enabled():raise HTTPException(503,'生成服务尚未配置。')
 code=os.getenv('STUDIO_ACCESS_CODE')
 if code and not hmac.compare_digest(code,x_studio_code or ''):raise HTTPException(403,'制作邀请码不正确。')
 if not 1<=len(photos)<=40 or not 1<=len(title.strip())<=100:raise HTTPException(422,'请填写书名，并上传 1–40 页照片。')
 ip=hashlib.sha256((request.client.host if request.client else 'unknown').encode()).hexdigest();jid=secrets.token_hex(16);folder=ROOT/jid
 with lock,db() as c:
  count=c.execute('SELECT COUNT(*) FROM jobs WHERE (owner=? OR ip=?) AND created>?',(own,ip,time.time()-86400)).fetchone()[0]
  active=c.execute("SELECT COUNT(*) FROM jobs WHERE state IN ('uploading','queued','recognizing','voicing','packaging')").fetchone()[0]
  if count>=int(os.getenv('STUDIO_DAILY_LIMIT','3')) or active>=10:raise HTTPException(429,'今日制作次数已用完或正在排队，请稍后再试。')
  c.execute('INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?,?,?)',(jid,own,ip,secrets.token_urlsafe(32),title.strip(),'uploading','正在接收照片',0,len(photos),time.time()))
 try:
  folder.mkdir();(folder/'input').mkdir()
  total=0
  for i,f in enumerate(photos):
   raw=await f.read(12*1024*1024+1);total+=len(raw)
   if len(raw)>12*1024*1024 or total>100*1024*1024:raise ValueError('照片太大，请减少照片数量或压缩后再试。')
   import io
   with Image.open(io.BytesIO(raw)) as im:
    if im.width*im.height>40_000_000:raise ValueError('照片像素过大，请调整后再试。')
    im=ImageOps.exif_transpose(im).convert('RGB');im.thumbnail((2400,2400));im.save(folder/'input'/f'{i+1:03}.jpg',quality=95)
 except Exception:
  update(jid,'failed','照片读取失败，请换用清晰的 JPG 或 PNG。');raise HTTPException(422,'照片读取失败，请换用清晰的 JPG 或 PNG。')
 update(jid,'queued','照片已接收，等待生成',0,len(photos));pool.submit(run,jid,title.strip());return {'id':jid}
@app.get('/jobs/{jid}')
def status(jid:str,authorization:str|None=Header(None)):
 r=getjob(jid,authorization);return {k:r[k] for k in ['id','title','state','detail','current','total']}
def entry(r,request):
 base=os.getenv('STUDIO_PUBLIC_URL',str(request.base_url).rstrip('/')).rstrip('/')+'/assets/'+r['id']+'/'
 return {'id':'user-'+r['id'],'title':r['title'],'subtitle':'我的有声绘本','tag':'我的制作','pageCount':r['total'],'cover':base+'cover.jpg?key='+r['token'],'manifest':base+'book.json?key='+r['token']}
@app.get('/jobs/{jid}/preview')
def preview(jid:str,request:Request,authorization:str|None=Header(None)):
 r=getjob(jid,authorization)
 if r['state'] not in ['ready','published']:raise HTTPException(409,'绘本还没有生成完成。')
 return entry(r,request)
@app.post('/jobs/{jid}/publish')
def publish(jid:str,request:Request,authorization:str|None=Header(None)):
 r=getjob(jid,authorization)
 if r['state'] not in ['ready','published']:raise HTTPException(409,'绘本还没有生成完成。')
 update(jid,'published','已加入书架',r['current'],r['total']);return entry(r,request)
@app.get('/assets/{jid}/{filename}')
def asset(jid:str,filename:str,key:str,request:Request):
 with db() as c:r=c.execute("SELECT * FROM jobs WHERE id=? AND state IN ('ready','published')",(jid,)).fetchone()
 if not r or not hmac.compare_digest(key,r['token']) or not re.fullmatch(r'(p\d{2}\.jpg|cover\.jpg|story\.mp3|book\.json)',filename):raise HTTPException(404)
 file=ROOT/jid/'output'/filename
 if filename=='book.json':
  b=json.loads(file.read_text());base=os.getenv('STUDIO_PUBLIC_URL',str(request.base_url).rstrip('/')).rstrip('/')+'/assets/'+jid+'/'
  link=lambda name:base+name+'?key='+key
  for p in b['pages']:p['image']=link(p['image'])
  b['cover']=link('cover.jpg');b['narration']['src']=link('story.mp3');return JSONResponse(b,headers={'Cache-Control':'private, no-store'})
 return FileResponse(file,headers={'Cache-Control':'private, max-age=3600','Referrer-Policy':'no-referrer'})
