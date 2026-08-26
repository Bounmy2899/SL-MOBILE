-- =========================================================================
-- ໂພນມະນີ / SL-Mobile — ອັບເດດຖານຂໍ້ມູນ ຮອບທີ 4
-- ເພີ່ມ: 1 ສິນຄ້າ ໃສ່ໄດ້ຫຼາຍລຸ້ນ (ຕິກເລືອກ ຫຼື ວາງຈາກ Excel/Word)
-- ວິທີໃຊ້: Supabase > SQL Editor > New query > ລ້າງຊ່ອງ > ວາງ > Run
-- ຣັນຊ້ຳໄດ້ ບໍ່ມີ error ແລະ ບໍ່ລຶບຂໍ້ມູນເກົ່າ
-- =========================================================================

-- ລາຍການລຸ້ນທີ່ສິນຄ້ານີ້ໃສ່ໄດ້ (ເກັບເປັນ id ຂອງໝວດລຸ້ນ)
alter table products add column if not exists models jsonb not null default '[]'::jsonb;

-- ສິນຄ້າເກົ່າ: ຖ້າຜູກກັບລຸ້ນໃດລຸ້ນໜຶ່ງຢູ່ແລ້ວ ໃຫ້ຖືວ່າໃສ່ລຸ້ນນັ້ນໄດ້
update products p
set models = jsonb_build_array(p."categoryId")
where p.models = '[]'::jsonb
  and p."categoryId" is not null
  and exists (
    select 1 from categories c
    join categories parent on parent.id = c."parentId"
    where c.id = p."categoryId" and parent."parentId" is not null
  );

-- ດັດຊະນີ ເພື່ອຄົ້ນຫາສິນຄ້າຕາມລຸ້ນໄດ້ໄວ
create index if not exists products_models_idx on products using gin (models);
