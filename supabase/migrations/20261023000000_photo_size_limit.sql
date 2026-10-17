-- Photos are compressed in the browser to a 640px JPEG under 200 KB (toJpeg in kiosk-flow.tsx);
-- the bucket now refuses anything bigger, so storage stays small however a photo is uploaded.
update storage.buckets set file_size_limit = 204800 where id = 'visit-photos';
