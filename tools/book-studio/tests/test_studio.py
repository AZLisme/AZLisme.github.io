import copy,io,json,os,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
DATA=tempfile.TemporaryDirectory();os.environ['STUDIO_DATA']=DATA.name
import pipeline,server
from fastapi.testclient import TestClient
AUTH={'Authorization':'Bearer '+'a'*64}
RESULT={'title':'Hello · 你好','kind':'story','language':'en','corners':[[.1,.1],[.9,.1],[.9,.9],[.1,.9]],'warnings':[],'sentences':[{'text':'Hello world.','translation':'你好，世界。','box':[.2,.2,.7,.3],'narrate':True}]}
def photo():
 b=io.BytesIO();Image.new('RGB',(400,200),'white').save(b,'JPEG');return b.getvalue()
class StudioTest(unittest.TestCase):
 def setUp(self):
  self.client=TestClient(server.app)
  with server.db() as c:c.execute('DELETE FROM jobs')
 def test_unconfigured_and_owner_isolation(self):
  with patch('server.enabled',return_value=False):
   self.assertFalse(self.client.get('/health').json()['ready'])
   self.assertEqual(self.client.post('/jobs',headers=AUTH,data={'title':'Test'},files=[('photos',('p.jpg',photo(),'image/jpeg'))]).status_code,503)
  with patch('server.enabled',return_value=True),patch.object(server.pool,'submit'):
   r=self.client.post('/jobs',headers=AUTH,data={'title':'Test'},files=[('photos',('p.jpg',photo(),'image/jpeg'))]);self.assertEqual(r.status_code,200,r.text);jid=r.json()['id']
  self.assertEqual(self.client.get('/jobs/'+jid,headers={'Authorization':'Bearer '+'b'*64}).status_code,404)
  self.assertEqual(self.client.post('/jobs/'+jid+'/publish',headers=AUTH).status_code,409)
  self.assertEqual(self.client.get('/jobs/'+jid,headers=AUTH).json()['state'],'queued')
 def test_invite_and_invalid_image(self):
  with patch('server.enabled',return_value=True),patch.dict(os.environ,{'STUDIO_ACCESS_CODE':'test-invite'}):
   self.assertEqual(self.client.post('/jobs',headers=AUTH,data={'title':'Test'},files=[('photos',('p.jpg',photo()))]).status_code,403)
   self.assertEqual(self.client.post('/jobs',headers={**AUTH,'X-Studio-Code':'test-invite'},data={'title':'Test'},files=[('photos',('p.jpg',b'not an image'))]).status_code,422)
 def test_real_packaging_and_assets(self):
  with patch('server.enabled',return_value=True),patch.object(server.pool,'submit'):
   r=self.client.post('/jobs',headers=AUTH,data={'title':'Test'},files=[('photos',('p.jpg',photo())),('photos',('q.jpg',photo()))]);jid=r.json()['id']
  def voice(text,path):
   path.write_bytes(b'fixture');return b'\0'*(24000*2)
  with patch('pipeline.analyze',side_effect=lambda _:copy.deepcopy(RESULT)),patch('pipeline.synthesize',side_effect=voice):
   # Model substitutes; final audio encoding uses actual ffmpeg.
   book=pipeline.process(server.ROOT/jid,'Test','user-'+jid,lambda *a:None)
  self.assertEqual(len(book['narration']['pages']),2)
  self.assertAlmostEqual(book['pages'][1]['sentences'][0]['start'],1.38)
  self.assertEqual(book['pages'][0]['translationPairs'][0]['sentenceId'],'p01-s01')
  self.assertGreater((server.ROOT/jid/'output/story.mp3').stat().st_size,1000)
  server.update(jid,'ready','Ready',2,2)
  e=self.client.post('/jobs/'+jid+'/publish',headers=AUTH).json()
  manifest=self.client.get(e['manifest']);self.assertEqual(manifest.status_code,200)
  audio=manifest.json()['narration']['src']
  self.assertEqual(self.client.get(audio,headers={'Range':'bytes=0-99'}).status_code,206)
  self.assertEqual(self.client.get(audio.split('?')[0]+'?key=wrong').status_code,404)
  self.assertTrue(all(p['image'].startswith('http') for p in manifest.json()['pages']))
if __name__=='__main__':unittest.main()
