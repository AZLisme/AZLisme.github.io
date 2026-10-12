#!/usr/bin/env python3
"""Build, narrate, validate and plan immutable picture-book publication."""
import argparse,hashlib,json,re,shutil,subprocess,sys
from pathlib import Path
COS='https://pbook-1252924514.cos.ap-guangzhou.myqcloud.com/'
def read(p):return json.loads(Path(p).read_text(encoding='utf-8'))
def write(p,v):p=Path(p);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding='utf-8')
def safe_id(v):return isinstance(v,str) and bool(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,90}',v))
def norm(v):return re.sub(r'\s+',' ',v).strip()
def relative(root,name):
 if not isinstance(name,str) or not name or ':' in name or '\\' in name or name.startswith('/') or '..' in name.split('/'):raise ValueError('Invalid package path')
 p=(root/name).resolve()
 if not p.is_relative_to(root.resolve()):raise ValueError('Path escapes package')
 return p

def validate(book,publish=False,decode=False):
 root=Path(book);b=read(root/'book.json');errors=[];warnings=[]
 for key in ['id','revision']:
  if not safe_id(b.get(key)):errors.append('Invalid '+key)
 if b.get('schemaVersion')!='1.2':errors.append('Unsupported schemaVersion')
 if not isinstance(b.get('title'),str) or not b['title'].strip():errors.append('Missing title')
 if b.get('quality',{}).get('unresolved'):(errors if publish else warnings).append('Unresolved content questions')
 seen=set();sentence_ids=set();audio_files=set();stories=[]
 def asset(name,label):
  try:
   p=relative(root,name)
   if not p.is_file() or not p.stat().st_size:errors.append(label+' missing/empty')
   return p
  except ValueError:errors.append(label+' unsafe path');return None
 asset(b.get('cover'),'Cover')
 if not isinstance(b.get('pages'),list) or not b['pages']:raise ValueError('No reading pages')
 for p in b['pages']:
  pid=p.get('id')
  if not safe_id(pid) or pid in seen:errors.append('Invalid/duplicate page ID')
  seen.add(pid);asset(p.get('image'),str(pid)+' image')
  if p.get('kind') not in ['cover','reference','story']:errors.append(str(pid)+' invalid kind')
  for lang in ['en','zh']:
   if not isinstance(p.get('text',{}).get(lang),str) or not p['text'][lang].strip():errors.append(str(pid)+' missing '+lang)
  a=p.get('audio',{});status=a.get('status')
  if p.get('kind')=='story':
   stories.append(p);ss=p.get('sentences',[])
   if not ss:errors.append(str(pid)+' no sentences')
   if norm(' '.join(s.get('text','') for s in ss))!=norm(p.get('text',{}).get('en','')):errors.append(str(pid)+' sentence text differs from page text')
   for s in ss:
    sid=s.get('id')
    if not safe_id(sid) or sid in sentence_ids:errors.append('Invalid/duplicate sentence ID')
    sentence_ids.add(sid);anchor=s.get('anchor',{})
    if any(not isinstance(anchor.get(k),(int,float)) or not 0<anchor[k]<1 for k in ['x','y']):errors.append(str(sid)+' missing/invalid anchor')
   if status=='pending':(errors if publish else warnings).append(str(pid)+' audio pending')
   elif status!='ready':errors.append(str(pid)+' story must have ready/pending audio')
  elif status!='omitted' or not a.get('reason'):errors.append(str(pid)+' reference/cover must omit audio explicitly')
  if status=='ready':
   f=asset(a.get('src'),str(pid)+' audio')
   if f:audio_files.add(f)
   if a.get('textSha256')!=hashlib.sha256(p['text']['en'].encode()).hexdigest():errors.append(str(pid)+' stale narration text')
 if stories and all(p['audio']['status']=='ready' for p in stories):
  n=b.get('narration',{});full=asset(n.get('src'),'Full narration')
  if full:audio_files.add(full)
  timeline=n.get('pages',[]);last=-1
  if [t.get('pageId') for t in timeline]!=[p['id'] for p in stories]:errors.append('Narration page order mismatch')
  for p,t in zip(stories,timeline):
   start,end=t.get('start',-1),t.get('end',-1)
   if not 0<=start<end<=n.get('duration',0) or start<last:errors.append('Invalid page audio range')
   last=end;previous=start
   for s in p['sentences']:
    x,y=s.get('start',-1),s.get('end',-1)
    if not previous-.0001<=x<y<=end+.0001:errors.append(s['id']+' invalid sentence range')
    previous=y
 if decode and not errors:
  for f in audio_files:subprocess.run(['ffmpeg','-v','error','-i',str(f),'-f','null','-'],check=True)
 return b,errors,warnings

def prepare(a):
 from PIL import Image,ImageOps
 source=read(a.source);root=Path(a.output);parent=Path(a.source).resolve().parent
 if root.exists():raise ValueError('Output directory already exists; use a fresh directory')
 if not safe_id(source.get('id')) or not safe_id(a.revision):raise ValueError('Unsafe book ID/revision')
 pages=source.get('pages',[])
 if not pages or len({p.get('id') for p in pages})!=len(pages) or not all(safe_id(p.get('id')) for p in pages):raise ValueError('Invalid page IDs')
 for p in pages:
  if p.get('kind') not in ['cover','reference','story']:raise ValueError('Invalid page kind')
  if not (parent/p['photo']).is_file():raise ValueError('Source photo missing: '+p['id'])
 root.mkdir(parents=True);result=[]
 for p in pages:
  with Image.open(parent/p['photo']) as raw:im=ImageOps.exif_transpose(raw).convert('RGB')
  rotation=p.get('rotate',0)
  if rotation not in [0,90,180,270]:raise ValueError('Rotation must be 0/90/180/270')
  if rotation:im=im.rotate(-rotation,expand=True)
  c=p.get('crop',[0,0,1,1])
  if len(c)!=4 or not 0<=c[0]<c[2]<=1 or not 0<=c[1]<c[3]<=1:raise ValueError('Invalid crop rectangle')
  w,h=im.size;im=im.crop((round(c[0]*w),round(c[1]*h),round(c[2]*w),round(c[3]*h)));im.thumbnail((2400,2400))
  image='images/'+p['id']+'.jpg';target=root/image;target.parent.mkdir(exist_ok=True);im.save(target,quality=92,optimize=True)
  q={k:p[k] for k in ['id','title','kind','text']};q['image']=image
  if p['kind']=='story':q['sentences']=p.get('sentences',[]);q['audio']={'status':'pending','src':None}
  else:q['audio']={'status':'omitted','src':None,'reason':p['kind']}
  result.append(q)
 cover_id=source.get('coverPageId',result[0]['id']);cover=next((p['image'] for p in result if p['id']==cover_id),None)
 if not cover:raise ValueError('coverPageId not found')
 b={'schemaVersion':'1.2','id':source['id'],'revision':a.revision,'title':source['title'],'subtitle':source.get('subtitle',''),'author':source.get('author',''),'language':'en','translationLanguage':'zh-CN','readingDirection':'ltr','cover':cover,'quality':source.get('quality',{'unresolved':[]}), 'pages':result}
 write(root/'book.json',b);_,errors,warnings=validate(root)
 if errors:raise ValueError('; '.join(errors))
 print(json.dumps({'package':str(root.resolve()),'pages':len(result),'warnings':warnings},ensure_ascii=False))

def narrate(a):
 import numpy as np,soundfile as sf,onnxruntime as rt
 from kokoro_onnx import Kokoro
 root=Path(a.book);b,errors,_=validate(root)
 if errors:raise ValueError('; '.join(errors))
 if b.get('quality',{}).get('unresolved'):raise ValueError('Resolve content questions before narration')
 opts=rt.SessionOptions();opts.intra_op_num_threads=2;opts.inter_op_num_threads=1
 session=rt.InferenceSession(a.model,sess_options=opts,providers=['CPUExecutionProvider']);k=Kokoro.from_session(session,a.voices)
 sr=24000;track=[np.zeros(int(.15*sr),dtype='float32')];offset=len(track[0]);timeline=[];out=root/'audio';out.mkdir(exist_ok=True)
 def mp3(samples,name):
  wav=out/(name+'.wav');sf.write(wav,samples,sr)
  subprocess.run(['ffmpeg','-v','error','-y','-i',str(wav),'-c:a','libmp3lame','-b:a','160k',str(out/(name+'.mp3'))],check=True);wav.unlink()
 for p in b['pages']:
  if p['kind']!='story':continue
  start=offset/sr;pieces=[]
  for s in p['sentences']:
   samples,rate=k.create(s.get('spokenText',s['text']),voice=a.voice,speed=a.speed,lang='en-us')
   if rate!=sr or len(samples)<sr*.1:raise ValueError('Missing narration samples')
   samples=np.concatenate([np.zeros(int(.05*sr),dtype='float32'),samples]);s['start']=round(offset/sr,4);s['end']=round((offset+len(samples))/sr,4)
   piece=np.concatenate([samples,np.zeros(int(.32*sr),dtype='float32')]);pieces.append(piece);track.append(piece);offset+=len(piece)
  timeline.append({'pageId':p['id'],'start':round(start,4),'end':p['sentences'][-1]['end']});mp3(np.concatenate(pieces),p['id'])
  p['audio']={'status':'ready','src':'audio/'+p['id']+'.mp3','engine':'Kokoro-82M','voice':a.voice,'speed':a.speed,'textSha256':hashlib.sha256(p['text']['en'].encode()).hexdigest()}
  gap=np.zeros(int(.65*sr),dtype='float32');track.append(gap);offset+=len(gap);print('Narrated',p['id'],flush=True)
 if timeline:
  full=np.concatenate(track);mp3(full,'story');b['narration']={'src':'audio/story.mp3','engine':'Kokoro-82M','voice':a.voice,'speed':a.speed,'duration':round(len(full)/sr,4),'pages':timeline}
 write(root/'book.json',b);_,errors,_=validate(root,publish=True,decode=True)
 if errors:raise ValueError('; '.join(errors))
 print('Narration and decoding checks passed')

def plan(a):
 root=Path(a.book);b,errors,_=validate(root,publish=True,decode=True)
 if errors:raise ValueError('; '.join(errors))
 catalog=read(a.catalog);existing=next((e for e in catalog['books'] if e['id']==b['id']),None)
 manifest='books/'+b['id']+'/'+b['revision']+'/book.json'
 if existing and existing['manifest']==manifest:raise ValueError('Revision is already published; use a fresh revision')
 output=Path(a.output)
 if output.exists():raise ValueError('Plan output directory exists')
 output.mkdir(parents=True);prefix='books/'+b['id']+'/'+b['revision']+'/';resources={b['cover']}
 for p in b['pages']:
  resources.add(p['image'])
  if p['audio']['status']=='ready':resources.add(p['audio']['src'])
 if b.get('narration'):resources.add(b['narration']['src'])
 assets=[]
 for name in sorted(resources):
  f=relative(root,name);assets.append({'file':str(f.resolve()),'key':prefix+name,'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'size':f.stat().st_size})
 published=json.loads(json.dumps(b));published.pop('quality',None);published['cover']=COS+prefix+b['cover']
 for p in published['pages']:
  p['image']=COS+prefix+p['image']
  if p['audio']['status']=='ready':p['audio']['src']=COS+prefix+p['audio']['src']
 if published.get('narration'):published['narration']['src']=COS+prefix+published['narration']['src']
 entry={'id':b['id'],'title':b['title'],'subtitle':b.get('subtitle',''),'author':b.get('author',''),'cover':published['cover'],'manifest':manifest,'pageCount':len(b['pages'])}
 books=catalog['books'];catalog['books']=[entry if e['id']==b['id'] else e for e in books]
 if not existing:catalog['books'].append(entry)
 catalog['schemaVersion']='1.2';catalog['revision']=b['id']+'-'+b['revision'];catalog.setdefault('recommended',[])
 write(output/'pages/pbook'/manifest,published);write(output/'pages/pbook/catalog.json',catalog)
 write(output/'upload-plan.json',{'bucket':'pbook-1252924514','region':'ap-guangzhou','assets':assets})
 print(json.dumps({'plan':str(output.resolve()),'assets':len(assets),'pagesFiles':2,'bookId':b['id']},ensure_ascii=False))

def main():
 ap=argparse.ArgumentParser();sub=ap.add_subparsers(dest='command',required=True)
 p=sub.add_parser('prepare');p.add_argument('--source',required=True);p.add_argument('--output',required=True);p.add_argument('--revision',required=True)
 p=sub.add_parser('narrate');p.add_argument('--book',required=True);p.add_argument('--model',required=True);p.add_argument('--voices',required=True);p.add_argument('--voice',default='af_heart');p.add_argument('--speed',type=float,default=.9)
 p=sub.add_parser('validate');p.add_argument('--book',required=True);p.add_argument('--publish',action='store_true');p.add_argument('--decode',action='store_true')
 p=sub.add_parser('publish-plan');p.add_argument('--book',required=True);p.add_argument('--catalog',required=True);p.add_argument('--output',required=True)
 a=ap.parse_args()
 try:
  if a.command=='prepare':prepare(a)
  elif a.command=='narrate':narrate(a)
  elif a.command=='publish-plan':plan(a)
  else:
   _,errors,warnings=validate(a.book,a.publish,a.decode);print(json.dumps({'errors':errors,'warnings':warnings},ensure_ascii=False));return int(bool(errors))
 except Exception as e:print('ERROR:',type(e).__name__,str(e),file=sys.stderr);return 1
 return 0
if __name__=='__main__':raise SystemExit(main())
