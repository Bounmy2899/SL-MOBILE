-- =========================================================================
-- ໂພນມະນີ / SL-Mobile — ອັບເດດຖານຂໍ້ມູນ ຮອບທີ 3 (ສະບັບກະທັດຮັດ)
-- ໝວດ 3 ຊັ້ນ + ຫຼາຍຮູບ + ສີ · ຣັນຊ້ຳໄດ້ ບໍ່ມີ error
-- ວິທີໃຊ້: Supabase > SQL Editor > New query > ລ້າງຊ່ອງ > ວາງ > Run
-- =========================================================================

alter table categories add column if not exists "parentId" bigint references categories(id) on delete cascade;
alter table categories add column if not exists image text not null default '';
alter table categories add column if not exists icon  text not null default '';
alter table categories add column if not exists sort  integer not null default 0;
alter table products   add column if not exists images jsonb not null default '[]'::jsonb;
alter table products   add column if not exists colors jsonb not null default '[]'::jsonb;

create unique index if not exists categories_name_parent_uniq
  on categories (name, coalesce("parentId", 0));

update products set images = jsonb_build_array(image)
where image <> '' and (images = '[]'::jsonb or images is null);

do $$
declare
  tops   text[] := array['ເຄສໂທລະສັບ','ຈໍໂທລະສັບ','ແບັດເຕີຣີ','ຝາຫຼັງ / ບອດີ້','ສາຍສາກ & ຫົວສາກ','ອຸປະກອນເສີມອື່ນໆ'];
  icons  text[] := array['🛡️','📱','🔋','🧩','🔌','🎧'];
  models text[][] := array[array['iPhone 7','iPhone 7 Plus','iPhone 8','iPhone 8 Plus','iPhone X','iPhone XR','iPhone XS','iPhone XS Max','iPhone 11','iPhone 11 Pro','iPhone 11 Pro Max','iPhone 12 mini','iPhone 12','iPhone 12 Pro','iPhone 12 Pro Max','iPhone 13 mini','iPhone 13','iPhone 13 Pro','iPhone 13 Pro Max','iPhone 14','iPhone 14 Plus','iPhone 14 Pro','iPhone 14 Pro Max','iPhone 15','iPhone 15 Plus','iPhone 15 Pro','iPhone 15 Pro Max','iPhone 16','iPhone 16e','iPhone 16 Plus','iPhone 16 Pro','iPhone 16 Pro Max','iPhone 17','iPhone 17e','iPhone 17 Pro','iPhone 17 Pro Max','iPhone Air','iPhone SE (2020)','iPhone SE (2022)'], array['Samsung A05','Samsung A15','Samsung A16','Samsung A25','Samsung A35','Samsung A55','Samsung S21','Samsung S22','Samsung S23','Samsung S23 Ultra','Samsung S24','Samsung S24 Ultra','Samsung S25','Samsung S25 Ultra','Oppo A17','Oppo A38','Oppo A58','Oppo A78','Oppo A98','Oppo Reno 10','Oppo Reno 11','Oppo Reno 12','Oppo Reno 13','Vivo Y17','Vivo Y27','Vivo Y36','Vivo Y100','Vivo V29','Vivo V30','Vivo V40','Redmi 13','Redmi Note 13','Redmi Note 14','Poco X6','Xiaomi 14','Realme C55','Realme C65','Realme 12 Pro','Huawei Nova 12']];
  groups text[] := array['iPhone','Android'];
  id1 bigint; id2 bigint; i int; g int; m int;
begin
  for i in 1 .. array_length(tops, 1) loop
    insert into categories (name, "parentId", icon, sort) values (tops[i], null, icons[i], i * 10)
      on conflict (name, coalesce("parentId", 0)) do update set icon = excluded.icon
      returning id into id1;

    for g in 1 .. array_length(groups, 1) loop
      insert into categories (name, "parentId", sort) values (groups[g], id1, g * 10)
        on conflict (name, coalesce("parentId", 0)) do update set sort = excluded.sort
        returning id into id2;

      for m in 1 .. array_length(models, 2) loop
        if models[g][m] is not null then
          insert into categories (name, "parentId", sort) values (models[g][m], id2, m * 10)
            on conflict (name, coalesce("parentId", 0)) do nothing;
        end if;
      end loop;
    end loop;
  end loop;
end $$;
