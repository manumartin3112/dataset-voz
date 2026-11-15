import io,json,os,tempfile,unittest,wave,zipfile
from app import create_app
class CollectionTests(unittest.TestCase):
 def setUp(self):
  os.environ['VOICE_UPLOAD_TOKEN']='u'*32;os.environ['VOICE_ADMIN_TOKEN']='a'*32
  self.tmp=tempfile.TemporaryDirectory();self.client=create_app(self.tmp.name).test_client()
  self.meta=dict(id='take-001',participant='P001',session='session-001',device='micro',conditions='silencio',phrase_id='a',take=1,consent=True,recorded_at='2026-11-15T12:00:00Z',session_date='2026-11-15')
 def tearDown(self):self.tmp.cleanup()
 def upload(self,seconds=8,token='u'*32):
  b=io.BytesIO()
  with wave.open(b,'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000);w.writeframes(b'\x01\x00'*16000*seconds)
  return self.client.post('/api/takes',headers={'Authorization':'Bearer '+token},data={'metadata':json.dumps(self.meta),'audio':(io.BytesIO(b.getvalue()),'a.wav')})
 def test_retry_and_export_preserve_audio_and_metadata(self):
  self.assertEqual(self.upload().status_code,201);self.assertTrue(self.upload().json['repeated'])
  self.assertEqual(self.client.get('/api/export',headers={'Authorization':'Bearer '+'u'*32}).status_code,403)
  response=self.client.get('/api/export',headers={'Authorization':'Bearer '+'a'*32})
  with zipfile.ZipFile(io.BytesIO(response.data)) as z:
   rows=json.loads(z.read('manifest.json'));self.assertEqual(len(rows),1);self.assertEqual(rows[0]['participant'],'P001');self.assertEqual(rows[0]['seconds'],8);self.assertEqual(len(z.read(rows[0]['file'])),256044)
 def test_reject_invalid_and_unauthorized(self):
  self.assertEqual(self.upload(token='bad').status_code,403)
  self.assertEqual(self.upload(seconds=2).status_code,400)
  self.meta['consent']=False;self.assertEqual(self.upload().status_code,400)
 def test_conflicts_do_not_replace_original(self):
  self.upload();self.meta['participant']='P002';self.assertEqual(self.upload().status_code,409)
 def test_same_slot_and_changed_session_are_rejected(self):
  self.assertEqual(self.upload().status_code,201)
  self.meta['id']='take-002';self.assertEqual(self.upload().status_code,409)
  self.meta['take']=2;self.meta['device']='other';self.assertEqual(self.upload().status_code,409)
  self.meta['device']='micro';self.assertEqual(self.upload().status_code,201)
 def test_persistence_after_restart(self):
  self.upload();self.client=create_app(self.tmp.name).test_client()
  self.assertTrue(self.upload().json['repeated'])
 def test_metadata_must_be_object(self):
  r=self.client.post('/api/takes',headers={'Authorization':'Bearer '+'u'*32},data={'metadata':'[]'})
  self.assertEqual(r.status_code,400)
if __name__=='__main__':unittest.main()
