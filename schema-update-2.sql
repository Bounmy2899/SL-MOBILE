-- =========================================================================
-- ໂພນມະນີ / SL-Mobile — ອັບເດດຖານຂໍ້ມູນ (ຮອບທີ 3)
-- ໝວດສິນຄ້າ 3 ຊັ້ນ + ຫຼາຍຮູບຕໍ່ສິນຄ້າ + ສີໃຫ້ເລືອກ
-- -------------------------------------------------------------------------
-- ວິທີໃຊ້: Supabase > SQL Editor > New query > ລ້າງຊ່ອງ (Ctrl+A, Delete)
--          > ວາງໄຟລ໌ນີ້ > Run    (ຣັນຊ້ຳໄດ້ ບໍ່ມີ error)
-- =========================================================================

-- ---------- 1) ຖັນໃໝ່ ----------
alter table categories add column if not exists "parentId" bigint references categories(id) on delete cascade;
alter table categories add column if not exists image text not null default '';
alter table categories add column if not exists icon  text not null default '';
alter table categories add column if not exists sort  integer not null default 0;

alter table products   add column if not exists images jsonb not null default '[]'::jsonb;
alter table products   add column if not exists colors jsonb not null default '[]'::jsonb;

-- ຊື່ໝວດຊ້ຳກັນໄດ້ ຖ້າຢູ່ຄົນລະແມ່ (ເຊັ່ນ "iPhone" ຢູ່ໃຕ້ທັງເຄສ ແລະ ຈໍ)
create unique index if not exists categories_name_parent_uniq
  on categories (name, coalesce("parentId", 0));

-- ຍ້າຍຮູບເກົ່າ (ຖັນ image) ເຂົ້າໄປໃນ images ໃຫ້ສິນຄ້າທີ່ມີຢູ່ແລ້ວ
update products set images = jsonb_build_array(image)
where image <> '' and (images = '[]'::jsonb or images is null);

-- ---------- 2) ສ້າງໝວດສິນຄ້າ 3 ຊັ້ນ ----------
do $$
declare
  l1 bigint; l2 bigint;
begin

  -- ===== ເຄສໂທລະສັບ =====
  insert into categories (name, "parentId", icon, sort) values ('ເຄສໂທລະສັບ', null, '🛡️', 10)
    on conflict (name, coalesce("parentId", 0)) do update set icon = excluded.icon, sort = excluded.sort
    returning id into l1;
  if l1 is null then select id into l1 from categories where name = 'ເຄສໂທລະສັບ' and "parentId" is null; end if;

  insert into categories (name, "parentId", icon, sort) values ('iPhone', l1, '', 10)
    on conflict (name, coalesce("parentId", 0)) do update set sort = excluded.sort
    returning id into l2;
  if l2 is null then select id into l2 from categories where name = 'iPhone' and "parentId" = l1; end if;

  insert into categories (name, "parentId", sort) values
    ('iPhone 7', l2, 0),
    ('iPhone 7 Plus', l2, 10),
    ('iPhone 8', l2, 20),
    ('iPhone 8 Plus', l2, 30),
    ('iPhone X', l2, 40),
    ('iPhone XR', l2, 50),
    ('iPhone XS', l2, 60),
    ('iPhone XS Max', l2, 70),
    ('iPhone 11', l2, 80),
    ('iPhone 11 Pro', l2, 90),
    ('iPhone 11 Pro Max', l2, 100),
    ('iPhone 12 mini', l2, 110),
    ('iPhone 12', l2, 120),
    ('iPhone 12 Pro', l2, 130),
    ('iPhone 12 Pro Max', l2, 140),
    ('iPhone 13 mini', l2, 150),
    ('iPhone 13', l2, 160),
    ('iPhone 13 Pro', l2, 170),
    ('iPhone 13 Pro Max', l2, 180),
    ('iPhone 14', l2, 190),
    ('iPhone 14 Plus', l2, 200),
    ('iPhone 14 Pro', l2, 210),
    ('iPhone 14 Pro Max', l2, 220),
    ('iPhone 15', l2, 230),
    ('iPhone 15 Plus', l2, 240),
    ('iPhone 15 Pro', l2, 250),
    ('iPhone 15 Pro Max', l2, 260),
    ('iPhone 16', l2, 270),
    ('iPhone 16e', l2, 280),
    ('iPhone 16 Plus', l2, 290),
    ('iPhone 16 Pro', l2, 300),
    ('iPhone 16 Pro Max', l2, 310),
    ('iPhone 17', l2, 320),
    ('iPhone 17e', l2, 330),
    ('iPhone 17 Pro', l2, 340),
    ('iPhone 17 Pro Max', l2, 350),
    ('iPhone Air', l2, 360),
    ('iPhone SE (2020)', l2, 370),
    ('iPhone SE (2022)', l2, 380)
  on conflict (name, coalesce("parentId", 0)) do nothing;

  insert into categories (name, "parentId", icon, sort) values ('Android', l1, '', 20)
    on conflict (name, coalesce("parentId", 0)) do update set sort = excluded.sort
    returning id into l2;
  if l2 is null then select id into l2 from categories where name = 'Android' and "parentId" = l1; end if;

  insert into categories (name, "parentId", sort) values
    ('Samsung A05', l2, 0),
    ('Samsung A15', l2, 10),
    ('Samsung A16', l2, 20),
    ('Samsung A25', l2, 30),
    ('Samsung A35', l2, 40),
    ('Samsung A55', l2, 50),
    ('Samsung S21', l2, 60),
    ('Samsung S22', l2, 70),
    ('Samsung S23', l2, 80),
    ('Samsung S23 Ultra', l2, 90),
    ('Samsung S24', l2, 100),
    ('Samsung S24 Ultra', l2, 110),
    ('Samsung S25', l2, 120),
    ('Samsung S25 Ultra', l2, 130),
    ('Oppo A17', l2, 140),
    ('Oppo A38', l2, 150),
    ('Oppo A58', l2, 160),
    ('Oppo A78', l2, 170),
    ('Oppo A98', l2, 180),
    ('Oppo Reno 10', l2, 190),
    ('Oppo Reno 11', l2, 200),
    ('Oppo Reno 12', l2, 210),
    ('Oppo Reno 13', l2, 220),
    ('Vivo Y17', l2, 230),
    ('Vivo Y27', l2, 240),
    ('Vivo Y36', l2, 250),
    ('Vivo Y100', l2, 260),
    ('Vivo V29', l2, 270),
    ('Vivo V30', l2, 280),
    ('Vivo V40', l2, 290),
    ('Redmi 13', l2, 300),
    ('Redmi Note 13', l2, 310),
    ('Redmi Note 14', l2, 320),
    ('Poco X6', l2, 330),
    ('Xiaomi 14', l2, 340),
    ('Realme C55', l2, 350),
    ('Realme C65', l2, 360),
    ('Realme 12 Pro', l2, 370),
    ('Huawei Nova 12', l2, 380)
  on conflict (name, coalesce("parentId", 0)) do nothing;

  -- ===== ຈໍໂທລະສັບ =====
  insert into categories (name, "parentId", icon, sort) values ('ຈໍໂທລະສັບ', null, '📱', 20)
    on conflict (name, coalesce("parentId", 0)) do update set icon = excluded.icon, sort = excluded.sort
    returning id into l1;
  if l1 is null then select id into l1 from categories where name = 'ຈໍໂທລະສັບ' and "parentId" is null; end if;

  insert into categories (name, "parentId", icon, sort) values ('iPhone', l1, '', 10)
    on conflict (name, coalesce("parentId", 0)) do update set sort = excluded.sort
    returning id into l2;
  if l2 is null then select id into l2 from categories where name = 'iPhone' and "parentId" = l1; end if;

  insert into categories (name, "parentId", sort) values
    ('iPhone 7', l2, 0),
    ('iPhone 7 Plus', l2, 10),
    ('iPhone 8', l2, 20),
    ('iPhone 8 Plus', l2, 30),
    ('iPhone X', l2, 40),
    ('iPhone XR', l2, 50),
    ('iPhone XS', l2, 60),
    ('iPhone XS Max', l2, 70),
    ('iPhone 11', l2, 80),
    ('iPhone 11 Pro', l2, 90),
    ('iPhone 11 Pro Max', l2, 100),
    ('iPhone 12 mini', l2, 110),
    ('iPhone 12', l2, 120),
    ('iPhone 12 Pro', l2, 130),
    ('iPhone 12 Pro Max', l2, 140),
    ('iPhone 13 mini', l2, 150),
    ('iPhone 13', l2, 160),
    ('iPhone 13 Pro', l2, 170),
    ('iPhone 13 Pro Max', l2, 180),
    ('iPhone 14', l2, 190),
    ('iPhone 14 Plus', l2, 200),
    ('iPhone 14 Pro', l2, 210),
    ('iPhone 14 Pro Max', l2, 220),
    ('iPhone 15', l2, 230),
    ('iPhone 15 Plus', l2, 240),
    ('iPhone 15 Pro', l2, 250),
    ('iPhone 15 Pro Max', l2, 260),
    ('iPhone 16', l2, 270),
    ('iPhone 16e', l2, 280),
    ('iPhone 16 Plus', l2, 290),
    ('iPhone 16 Pro', l2, 300),
    ('iPhone 16 Pro Max', l2, 310),
    ('iPhone 17', l2, 320),
    ('iPhone 17e', l2, 330),
    ('iPhone 17 Pro', l2, 340),
    ('iPhone 17 Pro Max', l2, 350),
    ('iPhone Air', l2, 360),
    ('iPhone SE (2020)', l2, 370),
    ('iPhone SE (2022)', l2, 380)
  on conflict (name, coalesce("parentId", 0)) do nothing;

  insert into categories (name, "parentId", icon, sort) values ('Android', l1, '', 20)
    on conflict (name, coalesce("parentId", 0)) do update set sort = excluded.sort
    returning id into l2;
  if l2 is null then select id into l2 from categories where name = 'Android' and "parentId" = l1; end if;

  insert into categories (name, "parentId", sort) values
    ('Samsung A05', l2, 0),
    ('Samsung A15', l2, 10),
    ('Samsung A16', l2, 20),
    ('Samsung A25', l2, 30),
    ('Samsung A35', l2, 40),
    ('Samsung A55', l2, 50),
    ('Samsung S21', l2, 60),
    ('Samsung S22', l2, 70),
    ('Samsung S23', l2, 80),
    ('Samsung S23 Ultra', l2, 90),
    ('Samsung S24', l2, 100),
    ('Samsung S24 Ultra', l2, 110),
    ('Samsung S25', l2, 120),
    ('Samsung S25 Ultra', l2, 130),
    ('Oppo A17', l2, 140),
    ('Oppo A38', l2, 150),
    ('Oppo A58', l2, 160),
    ('Oppo A78', l2, 170),
    ('Oppo A98', l2, 180),
    ('Oppo Reno 10', l2, 190),
    ('Oppo Reno 11', l2, 200),
    ('Oppo Reno 12', l2, 210),
    ('Oppo Reno 13', l2, 220),
    ('Vivo Y17', l2, 230),
    ('Vivo Y27', l2, 240),
    ('Vivo Y36', l2, 250),
    ('Vivo Y100', l2, 260),
    ('Vivo V29', l2, 270),
    ('Vivo V30', l2, 280),
    ('Vivo V40', l2, 290),
    ('Redmi 13', l2, 300),
    ('Redmi Note 13', l2, 310),
    ('Redmi Note 14', l2, 320),
    ('Poco X6', l2, 330),
    ('Xiaomi 14', l2, 340),
    ('Realme C55', l2, 350),
    ('Realme C65', l2, 360),
    ('Realme 12 Pro', l2, 370),
    ('Huawei Nova 12', l2, 380)
  on conflict (name, coalesce("parentId", 0)) do nothing;

  -- ===== ແບັດເຕີຣີ =====
  insert into categories (name, "parentId", icon, sort) values ('ແບັດເຕີຣີ', null, '🔋', 30)
    on conflict (name, coalesce("parentId", 0)) do update set icon = excluded.icon, sort = excluded.sort
    returning id into l1;
  if l1 is null then select id into l1 from categories where name = 'ແບັດເຕີຣີ' and "parentId" is null; end if;

  insert into categories (name, "parentId", icon, sort) values ('iPhone', l1, '', 10)
    on conflict (name, coalesce("parentId", 0)) do update set sort = excluded.sort
    returning id into l2;
  if l2 is null then select id into l2 from categories where name = 'iPhone' and "parentId" = l1; end if;

  insert into categories (name, "parentId", sort) values
    ('iPhone 7', l2, 0),
    ('iPhone 7 Plus', l2, 10),
    ('iPhone 8', l2, 20),
    ('iPhone 8 Plus', l2, 30),
    ('iPhone X', l2, 40),
    ('iPhone XR', l2, 50),
    ('iPhone XS', l2, 60),
    ('iPhone XS Max', l2, 70),
    ('iPhone 11', l2, 80),
    ('iPhone 11 Pro', l2, 90),
    ('iPhone 11 Pro Max', l2, 100),
    ('iPhone 12 mini', l2, 110),
    ('iPhone 12', l2, 120),
    ('iPhone 12 Pro', l2, 130),
    ('iPhone 12 Pro Max', l2, 140),
    ('iPhone 13 mini', l2, 150),
    ('iPhone 13', l2, 160),
    ('iPhone 13 Pro', l2, 170),
    ('iPhone 13 Pro Max', l2, 180),
    ('iPhone 14', l2, 190),
    ('iPhone 14 Plus', l2, 200),
    ('iPhone 14 Pro', l2, 210),
    ('iPhone 14 Pro Max', l2, 220),
    ('iPhone 15', l2, 230),
    ('iPhone 15 Plus', l2, 240),
    ('iPhone 15 Pro', l2, 250),
    ('iPhone 15 Pro Max', l2, 260),
    ('iPhone 16', l2, 270),
    ('iPhone 16e', l2, 280),
    ('iPhone 16 Plus', l2, 290),
    ('iPhone 16 Pro', l2, 300),
    ('iPhone 16 Pro Max', l2, 310),
    ('iPhone 17', l2, 320),
    ('iPhone 17e', l2, 330),
    ('iPhone 17 Pro', l2, 340),
    ('iPhone 17 Pro Max', l2, 350),
    ('iPhone Air', l2, 360),
    ('iPhone SE (2020)', l2, 370),
    ('iPhone SE (2022)', l2, 380)
  on conflict (name, coalesce("parentId", 0)) do nothing;

  insert into categories (name, "parentId", icon, sort) values ('Android', l1, '', 20)
    on conflict (name, coalesce("parentId", 0)) do update set sort = excluded.sort
    returning id into l2;
  if l2 is null then select id into l2 from categories where name = 'Android' and "parentId" = l1; end if;

  insert into categories (name, "parentId", sort) values
    ('Samsung A05', l2, 0),
    ('Samsung A15', l2, 10),
    ('Samsung A16', l2, 20),
    ('Samsung A25', l2, 30),
    ('Samsung A35', l2, 40),
    ('Samsung A55', l2, 50),
    ('Samsung S21', l2, 60),
    ('Samsung S22', l2, 70),
    ('Samsung S23', l2, 80),
    ('Samsung S23 Ultra', l2, 90),
    ('Samsung S24', l2, 100),
    ('Samsung S24 Ultra', l2, 110),
    ('Samsung S25', l2, 120),
    ('Samsung S25 Ultra', l2, 130),
    ('Oppo A17', l2, 140),
    ('Oppo A38', l2, 150),
    ('Oppo A58', l2, 160),
    ('Oppo A78', l2, 170),
    ('Oppo A98', l2, 180),
    ('Oppo Reno 10', l2, 190),
    ('Oppo Reno 11', l2, 200),
    ('Oppo Reno 12', l2, 210),
    ('Oppo Reno 13', l2, 220),
    ('Vivo Y17', l2, 230),
    ('Vivo Y27', l2, 240),
    ('Vivo Y36', l2, 250),
    ('Vivo Y100', l2, 260),
    ('Vivo V29', l2, 270),
    ('Vivo V30', l2, 280),
    ('Vivo V40', l2, 290),
    ('Redmi 13', l2, 300),
    ('Redmi Note 13', l2, 310),
    ('Redmi Note 14', l2, 320),
    ('Poco X6', l2, 330),
    ('Xiaomi 14', l2, 340),
    ('Realme C55', l2, 350),
    ('Realme C65', l2, 360),
    ('Realme 12 Pro', l2, 370),
    ('Huawei Nova 12', l2, 380)
  on conflict (name, coalesce("parentId", 0)) do nothing;

  -- ===== ຝາຫຼັງ / ບອດີ້ =====
  insert into categories (name, "parentId", icon, sort) values ('ຝາຫຼັງ / ບອດີ້', null, '🧩', 40)
    on conflict (name, coalesce("parentId", 0)) do update set icon = excluded.icon, sort = excluded.sort
    returning id into l1;
  if l1 is null then select id into l1 from categories where name = 'ຝາຫຼັງ / ບອດີ້' and "parentId" is null; end if;

  insert into categories (name, "parentId", icon, sort) values ('iPhone', l1, '', 10)
    on conflict (name, coalesce("parentId", 0)) do update set sort = excluded.sort
    returning id into l2;
  if l2 is null then select id into l2 from categories where name = 'iPhone' and "parentId" = l1; end if;

  insert into categories (name, "parentId", sort) values
    ('iPhone 7', l2, 0),
    ('iPhone 7 Plus', l2, 10),
    ('iPhone 8', l2, 20),
    ('iPhone 8 Plus', l2, 30),
    ('iPhone X', l2, 40),
    ('iPhone XR', l2, 50),
    ('iPhone XS', l2, 60),
    ('iPhone XS Max', l2, 70),
    ('iPhone 11', l2, 80),
    ('iPhone 11 Pro', l2, 90),
    ('iPhone 11 Pro Max', l2, 100),
    ('iPhone 12 mini', l2, 110),
    ('iPhone 12', l2, 120),
    ('iPhone 12 Pro', l2, 130),
    ('iPhone 12 Pro Max', l2, 140),
    ('iPhone 13 mini', l2, 150),
    ('iPhone 13', l2, 160),
    ('iPhone 13 Pro', l2, 170),
    ('iPhone 13 Pro Max', l2, 180),
    ('iPhone 14', l2, 190),
    ('iPhone 14 Plus', l2, 200),
    ('iPhone 14 Pro', l2, 210),
    ('iPhone 14 Pro Max', l2, 220),
    ('iPhone 15', l2, 230),
    ('iPhone 15 Plus', l2, 240),
    ('iPhone 15 Pro', l2, 250),
    ('iPhone 15 Pro Max', l2, 260),
    ('iPhone 16', l2, 270),
    ('iPhone 16e', l2, 280),
    ('iPhone 16 Plus', l2, 290),
    ('iPhone 16 Pro', l2, 300),
    ('iPhone 16 Pro Max', l2, 310),
    ('iPhone 17', l2, 320),
    ('iPhone 17e', l2, 330),
    ('iPhone 17 Pro', l2, 340),
    ('iPhone 17 Pro Max', l2, 350),
    ('iPhone Air', l2, 360),
    ('iPhone SE (2020)', l2, 370),
    ('iPhone SE (2022)', l2, 380)
  on conflict (name, coalesce("parentId", 0)) do nothing;

  insert into categories (name, "parentId", icon, sort) values ('Android', l1, '', 20)
    on conflict (name, coalesce("parentId", 0)) do update set sort = excluded.sort
    returning id into l2;
  if l2 is null then select id into l2 from categories where name = 'Android' and "parentId" = l1; end if;

  insert into categories (name, "parentId", sort) values
    ('Samsung A05', l2, 0),
    ('Samsung A15', l2, 10),
    ('Samsung A16', l2, 20),
    ('Samsung A25', l2, 30),
    ('Samsung A35', l2, 40),
    ('Samsung A55', l2, 50),
    ('Samsung S21', l2, 60),
    ('Samsung S22', l2, 70),
    ('Samsung S23', l2, 80),
    ('Samsung S23 Ultra', l2, 90),
    ('Samsung S24', l2, 100),
    ('Samsung S24 Ultra', l2, 110),
    ('Samsung S25', l2, 120),
    ('Samsung S25 Ultra', l2, 130),
    ('Oppo A17', l2, 140),
    ('Oppo A38', l2, 150),
    ('Oppo A58', l2, 160),
    ('Oppo A78', l2, 170),
    ('Oppo A98', l2, 180),
    ('Oppo Reno 10', l2, 190),
    ('Oppo Reno 11', l2, 200),
    ('Oppo Reno 12', l2, 210),
    ('Oppo Reno 13', l2, 220),
    ('Vivo Y17', l2, 230),
    ('Vivo Y27', l2, 240),
    ('Vivo Y36', l2, 250),
    ('Vivo Y100', l2, 260),
    ('Vivo V29', l2, 270),
    ('Vivo V30', l2, 280),
    ('Vivo V40', l2, 290),
    ('Redmi 13', l2, 300),
    ('Redmi Note 13', l2, 310),
    ('Redmi Note 14', l2, 320),
    ('Poco X6', l2, 330),
    ('Xiaomi 14', l2, 340),
    ('Realme C55', l2, 350),
    ('Realme C65', l2, 360),
    ('Realme 12 Pro', l2, 370),
    ('Huawei Nova 12', l2, 380)
  on conflict (name, coalesce("parentId", 0)) do nothing;

  -- ===== ສາຍສາກ & ຫົວສາກ =====
  insert into categories (name, "parentId", icon, sort) values ('ສາຍສາກ & ຫົວສາກ', null, '🔌', 50)
    on conflict (name, coalesce("parentId", 0)) do update set icon = excluded.icon, sort = excluded.sort
    returning id into l1;
  if l1 is null then select id into l1 from categories where name = 'ສາຍສາກ & ຫົວສາກ' and "parentId" is null; end if;

  insert into categories (name, "parentId", icon, sort) values ('iPhone', l1, '', 10)
    on conflict (name, coalesce("parentId", 0)) do update set sort = excluded.sort
    returning id into l2;
  if l2 is null then select id into l2 from categories where name = 'iPhone' and "parentId" = l1; end if;

  insert into categories (name, "parentId", sort) values
    ('iPhone 7', l2, 0),
    ('iPhone 7 Plus', l2, 10),
    ('iPhone 8', l2, 20),
    ('iPhone 8 Plus', l2, 30),
    ('iPhone X', l2, 40),
    ('iPhone XR', l2, 50),
    ('iPhone XS', l2, 60),
    ('iPhone XS Max', l2, 70),
    ('iPhone 11', l2, 80),
    ('iPhone 11 Pro', l2, 90),
    ('iPhone 11 Pro Max', l2, 100),
    ('iPhone 12 mini', l2, 110),
    ('iPhone 12', l2, 120),
    ('iPhone 12 Pro', l2, 130),
    ('iPhone 12 Pro Max', l2, 140),
    ('iPhone 13 mini', l2, 150),
    ('iPhone 13', l2, 160),
    ('iPhone 13 Pro', l2, 170),
    ('iPhone 13 Pro Max', l2, 180),
    ('iPhone 14', l2, 190),
    ('iPhone 14 Plus', l2, 200),
    ('iPhone 14 Pro', l2, 210),
    ('iPhone 14 Pro Max', l2, 220),
    ('iPhone 15', l2, 230),
    ('iPhone 15 Plus', l2, 240),
    ('iPhone 15 Pro', l2, 250),
    ('iPhone 15 Pro Max', l2, 260),
    ('iPhone 16', l2, 270),
    ('iPhone 16e', l2, 280),
    ('iPhone 16 Plus', l2, 290),
    ('iPhone 16 Pro', l2, 300),
    ('iPhone 16 Pro Max', l2, 310),
    ('iPhone 17', l2, 320),
    ('iPhone 17e', l2, 330),
    ('iPhone 17 Pro', l2, 340),
    ('iPhone 17 Pro Max', l2, 350),
    ('iPhone Air', l2, 360),
    ('iPhone SE (2020)', l2, 370),
    ('iPhone SE (2022)', l2, 380)
  on conflict (name, coalesce("parentId", 0)) do nothing;

  insert into categories (name, "parentId", icon, sort) values ('Android', l1, '', 20)
    on conflict (name, coalesce("parentId", 0)) do update set sort = excluded.sort
    returning id into l2;
  if l2 is null then select id into l2 from categories where name = 'Android' and "parentId" = l1; end if;

  insert into categories (name, "parentId", sort) values
    ('Samsung A05', l2, 0),
    ('Samsung A15', l2, 10),
    ('Samsung A16', l2, 20),
    ('Samsung A25', l2, 30),
    ('Samsung A35', l2, 40),
    ('Samsung A55', l2, 50),
    ('Samsung S21', l2, 60),
    ('Samsung S22', l2, 70),
    ('Samsung S23', l2, 80),
    ('Samsung S23 Ultra', l2, 90),
    ('Samsung S24', l2, 100),
    ('Samsung S24 Ultra', l2, 110),
    ('Samsung S25', l2, 120),
    ('Samsung S25 Ultra', l2, 130),
    ('Oppo A17', l2, 140),
    ('Oppo A38', l2, 150),
    ('Oppo A58', l2, 160),
    ('Oppo A78', l2, 170),
    ('Oppo A98', l2, 180),
    ('Oppo Reno 10', l2, 190),
    ('Oppo Reno 11', l2, 200),
    ('Oppo Reno 12', l2, 210),
    ('Oppo Reno 13', l2, 220),
    ('Vivo Y17', l2, 230),
    ('Vivo Y27', l2, 240),
    ('Vivo Y36', l2, 250),
    ('Vivo Y100', l2, 260),
    ('Vivo V29', l2, 270),
    ('Vivo V30', l2, 280),
    ('Vivo V40', l2, 290),
    ('Redmi 13', l2, 300),
    ('Redmi Note 13', l2, 310),
    ('Redmi Note 14', l2, 320),
    ('Poco X6', l2, 330),
    ('Xiaomi 14', l2, 340),
    ('Realme C55', l2, 350),
    ('Realme C65', l2, 360),
    ('Realme 12 Pro', l2, 370),
    ('Huawei Nova 12', l2, 380)
  on conflict (name, coalesce("parentId", 0)) do nothing;

  -- ===== ອຸປະກອນເສີມອື່ນໆ =====
  insert into categories (name, "parentId", icon, sort) values ('ອຸປະກອນເສີມອື່ນໆ', null, '🎧', 60)
    on conflict (name, coalesce("parentId", 0)) do update set icon = excluded.icon, sort = excluded.sort
    returning id into l1;
  if l1 is null then select id into l1 from categories where name = 'ອຸປະກອນເສີມອື່ນໆ' and "parentId" is null; end if;

  insert into categories (name, "parentId", icon, sort) values ('iPhone', l1, '', 10)
    on conflict (name, coalesce("parentId", 0)) do update set sort = excluded.sort
    returning id into l2;
  if l2 is null then select id into l2 from categories where name = 'iPhone' and "parentId" = l1; end if;

  insert into categories (name, "parentId", sort) values
    ('iPhone 7', l2, 0),
    ('iPhone 7 Plus', l2, 10),
    ('iPhone 8', l2, 20),
    ('iPhone 8 Plus', l2, 30),
    ('iPhone X', l2, 40),
    ('iPhone XR', l2, 50),
    ('iPhone XS', l2, 60),
    ('iPhone XS Max', l2, 70),
    ('iPhone 11', l2, 80),
    ('iPhone 11 Pro', l2, 90),
    ('iPhone 11 Pro Max', l2, 100),
    ('iPhone 12 mini', l2, 110),
    ('iPhone 12', l2, 120),
    ('iPhone 12 Pro', l2, 130),
    ('iPhone 12 Pro Max', l2, 140),
    ('iPhone 13 mini', l2, 150),
    ('iPhone 13', l2, 160),
    ('iPhone 13 Pro', l2, 170),
    ('iPhone 13 Pro Max', l2, 180),
    ('iPhone 14', l2, 190),
    ('iPhone 14 Plus', l2, 200),
    ('iPhone 14 Pro', l2, 210),
    ('iPhone 14 Pro Max', l2, 220),
    ('iPhone 15', l2, 230),
    ('iPhone 15 Plus', l2, 240),
    ('iPhone 15 Pro', l2, 250),
    ('iPhone 15 Pro Max', l2, 260),
    ('iPhone 16', l2, 270),
    ('iPhone 16e', l2, 280),
    ('iPhone 16 Plus', l2, 290),
    ('iPhone 16 Pro', l2, 300),
    ('iPhone 16 Pro Max', l2, 310),
    ('iPhone 17', l2, 320),
    ('iPhone 17e', l2, 330),
    ('iPhone 17 Pro', l2, 340),
    ('iPhone 17 Pro Max', l2, 350),
    ('iPhone Air', l2, 360),
    ('iPhone SE (2020)', l2, 370),
    ('iPhone SE (2022)', l2, 380)
  on conflict (name, coalesce("parentId", 0)) do nothing;

  insert into categories (name, "parentId", icon, sort) values ('Android', l1, '', 20)
    on conflict (name, coalesce("parentId", 0)) do update set sort = excluded.sort
    returning id into l2;
  if l2 is null then select id into l2 from categories where name = 'Android' and "parentId" = l1; end if;

  insert into categories (name, "parentId", sort) values
    ('Samsung A05', l2, 0),
    ('Samsung A15', l2, 10),
    ('Samsung A16', l2, 20),
    ('Samsung A25', l2, 30),
    ('Samsung A35', l2, 40),
    ('Samsung A55', l2, 50),
    ('Samsung S21', l2, 60),
    ('Samsung S22', l2, 70),
    ('Samsung S23', l2, 80),
    ('Samsung S23 Ultra', l2, 90),
    ('Samsung S24', l2, 100),
    ('Samsung S24 Ultra', l2, 110),
    ('Samsung S25', l2, 120),
    ('Samsung S25 Ultra', l2, 130),
    ('Oppo A17', l2, 140),
    ('Oppo A38', l2, 150),
    ('Oppo A58', l2, 160),
    ('Oppo A78', l2, 170),
    ('Oppo A98', l2, 180),
    ('Oppo Reno 10', l2, 190),
    ('Oppo Reno 11', l2, 200),
    ('Oppo Reno 12', l2, 210),
    ('Oppo Reno 13', l2, 220),
    ('Vivo Y17', l2, 230),
    ('Vivo Y27', l2, 240),
    ('Vivo Y36', l2, 250),
    ('Vivo Y100', l2, 260),
    ('Vivo V29', l2, 270),
    ('Vivo V30', l2, 280),
    ('Vivo V40', l2, 290),
    ('Redmi 13', l2, 300),
    ('Redmi Note 13', l2, 310),
    ('Redmi Note 14', l2, 320),
    ('Poco X6', l2, 330),
    ('Xiaomi 14', l2, 340),
    ('Realme C55', l2, 350),
    ('Realme C65', l2, 360),
    ('Realme 12 Pro', l2, 370),
    ('Huawei Nova 12', l2, 380)
  on conflict (name, coalesce("parentId", 0)) do nothing;

end $$;
