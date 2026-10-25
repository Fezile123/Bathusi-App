-- Seed for public.resource_directory, generated from src/data/tccRegistry.json.
-- SAMPLE DATA: replace with facilities verified from official sources before real use (set last_verified + source).
insert into public.resource_directory (id,name,type,phone,lat,lng,address,hours,last_verified,source) values
  ('hotline-gbv-command','GBV Command Centre','hotline','0800 428 428',null,null,null,null,null,'TEAM TO VERIFY with official government/DSD source before use'),
  ('hotline-saps-10111','SAPS emergency line','hotline','10111',null,null,null,null,null,'TEAM TO VERIFY with official SAPS source before use'),
  ('hotline-112','Emergency number from a cell phone','hotline','112',null,null,null,null,null,'TEAM TO VERIFY with official source before use'),
  ('sample-tcc-1','SAMPLE Care Centre A (not a real facility)','tcc',null,-26.2041,28.0473,'Sample address',null,null,'SAMPLE: replace with a verified entry'),
  ('sample-police-1','SAMPLE Police Station B (not a real facility)','police',null,-26.1952,28.034,'Sample address',null,null,'SAMPLE: replace with a verified entry'),
  ('sample-cpf-1','SAMPLE Community Policing Forum C (not a real facility)','cpf',null,-26.23,28.08,'Sample address',null,null,'SAMPLE: replace with a verified entry')
on conflict (id) do update set name=excluded.name, type=excluded.type, phone=excluded.phone, lat=excluded.lat, lng=excluded.lng,
  address=excluded.address, hours=excluded.hours, last_verified=excluded.last_verified, source=excluded.source;
