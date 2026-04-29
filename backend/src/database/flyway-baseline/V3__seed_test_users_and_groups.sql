insert into users (id, user_code, display_name, created_at, updated_at)
values (1001, 'u1001', 'Test User One', now(), now()),
       (1002, 'u1002', 'Test User Two', now(), now());

insert into groups (id, group_code, group_name, status, created_at, updated_at)
values (2001, 'product-team', 'Product Team', 'ACTIVE', now(), now()),
       (2002, 'engineering-team', 'Engineering Team', 'ACTIVE', now(), now());

insert into group_memberships (user_id, group_id, created_at, updated_at)
values (1001, 2001, now(), now()),
       (1002, 2001, now(), now()),
       (1002, 2002, now(), now());
