-- =========================================================================
-- ໂພນມະນີ / SL-Mobile — ອັບເດດຖານຂໍ້ມູນ ຮອບທີ 5
-- ຈັດ Android ເປັນຊັ້ນ: Android › ຍີ່ຫໍ້ › ຊີຣີ້ › ລຸ້ນ
-- ໃສ່ຂໍ້ມູນ Samsung ຄົບທຸກຊີຣີ້ (S / A / M / Note / F)
-- ວິທີໃຊ້: Supabase > SQL Editor > ລ້າງຊ່ອງ > ວາງ > Run  (ຣັນຊ້ຳໄດ້)
-- =========================================================================

do $$
declare
  androidId bigint; brandId bigint; seriesId bigint; i int; k int; i2 int;
  brands text[] := array['Samsung','Oppo','Vivo','Xiaomi','Realme','Huawei','Honor','Infinix','Tecno','Nokia'];
  seriesNames text[] := array['Galaxy S','Galaxy A','Galaxy M','Galaxy Note','Galaxy F'];
  models text[][] := array[array['S','S2','S3','S3 Mini','S4','S4 Mini','S5','S5 Mini','S6','S6 Edge','S6 Edge+','S7','S7 Edge','S8','S8+','S9','S9+','S10','S10+','S10e','S10 5G','S10 Lite','S20','S20+','S20 Ultra','S20 FE','S21','S21+','S21 Ultra','S21 FE','S22','S22+','S22 Ultra','S23','S23+','S23 Ultra','S23 FE','S24','S24+','S24 Ultra','S24 FE','S25','S25+','S25 Ultra','S25 Edge','S25 FE','S26','S26+','S26 Ultra',null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null], array['A01','A01 Core','A02','A02s','A03','A03s','A03 Core','A04','A04e','A04s','A05','A05s','A06','A07','A07 5G','A10','A10s','A11','A12','A13','A13 5G','A14','A14 5G','A15','A15 5G','A16','A16 5G','A17','A17 5G','A20','A20s','A21','A21s','A22','A22 5G','A23','A23 5G','A24','A25 5G','A26 5G','A30','A30s','A31','A32','A32 5G','A33 5G','A34 5G','A35 5G','A36 5G','A37 5G','A40','A41','A42','A50','A50s','A51','A51 5G','A52','A52 5G','A52s','A53 5G','A54 5G','A55 5G','A56 5G','A57 5G'], array['M01','M01 Core','M01s','M02','M02s','M10','M11','M12','M13','M14','M14 5G','M20','M21','M21s','M22','M23 5G','M30','M30s','M31','M31s','M32','M33','M34','M40','M42 5G','M51','M52 5G','M53 5G','M54 5G','M55','M55 5G','M56','M62','M17','M36','M47',null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null], array['Note','Note II','Note 3','Note 4','Note 5','Note 7','Note FE','Note 8','Note 9','Note 10','Note 10+','Note 20','Note 20 Ultra',null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null], array['F02s','F04','F12','F13','F14','F14 5G','F15 5G','F22','F23 5G','F34 5G','F42 5G','F54 5G','F55 5G',null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]];
begin
  -- ໄລ່ທຸກໝວດໃຫຍ່ທີ່ມີກຸ່ມ Android (ເຄສ / ຈໍ / ແບັດ / ...)
  for androidId in select c.id from categories c
    join categories p on p.id = c."parentId"
    where c.name = 'Android' and p."parentId" is null
  loop
    -- ລຶບລຸ້ນເກົ່າແບບແປນທີ່ຍັງບໍ່ມີສິນຄ້າຜູກຢູ່ (ເຊັ່ນ 'Samsung A05' ທີ່ວາງຮວມກັນ)
    delete from categories old
    where old."parentId" = androidId
      and not exists (select 1 from categories ch where ch."parentId" = old.id)
      and not exists (select 1 from products pr where pr."categoryId" = old.id)
      and not exists (select 1 from products pr where pr.models @> to_jsonb(old.id));

    -- ສ້າງຍີ່ຫໍ້
    for i in 1 .. array_length(brands, 1) loop
      insert into categories (name, "parentId", sort) values (brands[i], androidId, i * 10)
        on conflict (name, coalesce("parentId", 0)) do update set sort = excluded.sort
        returning id into brandId;

      -- ສະເພາະ Samsung ໃສ່ຊີຣີ້ ແລະ ລຸ້ນໃຫ້ຄົບ
      if brands[i] = 'Samsung' then
        for k in 1 .. array_length(seriesNames, 1) loop
          insert into categories (name, "parentId", sort) values (seriesNames[k], brandId, k * 10)
            on conflict (name, coalesce("parentId", 0)) do update set sort = excluded.sort
            returning id into seriesId;
          for i2 in 1 .. array_length(models, 2) loop
            if models[k][i2] is not null then
              insert into categories (name, "parentId", sort) values (models[k][i2], seriesId, i2 * 10)
                on conflict (name, coalesce("parentId", 0)) do nothing;
            end if;
          end loop;
        end loop;
      end if;
    end loop;
  end loop;
end $$;

notify pgrst, 'reload schema';
