-- Extensions required by the scheduling engine.
create extension if not exists pgcrypto;   -- gen_random_uuid(), digest()
create extension if not exists btree_gist; -- exclusion constraint on (staff_id, tstzrange)
