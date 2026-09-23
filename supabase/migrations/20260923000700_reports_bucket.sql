-- Private bucket for job report PDFs (written with the service role; operators can read).
insert into storage.buckets (id, name, public) values ('reports', 'reports', false) on conflict (id) do nothing;
create policy "operators read reports" on storage.objects for select to authenticated
  using (bucket_id = 'reports' and (select private.is_operator()));
