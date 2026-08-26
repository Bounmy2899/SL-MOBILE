-- =========================================================================
-- ໂພນມະນີ — ອັບເດດຖານຂໍ້ມູນ (ຮອບທີ 2: ລະບົບອໍເດີ + ໝວດຍ່ອຍ)
-- -------------------------------------------------------------------------
-- ວິທີໃຊ້: Supabase Dashboard > SQL Editor > New query
-- ລ້າງຊ່ອງໃຫ້ຫວ່າງ (Ctrl+A ແລ້ວ Delete) → ວາງໄຟລ໌ນີ້ → ກົດ Run
-- ໄຟລ໌ນີ້ຣັນຊ້ຳໄດ້ ບໍ່ມີ error
-- =========================================================================

-- ໝວດຍ່ອຍ ເຊັ່ນ "iPhone 15 Pro Max" ພາຍໃນໝວດ "ເຄສໂທລະສັບ"
alter table products add column if not exists subcategory text not null default '';

-- ໝາຍວ່າອໍເດີນີ້ຕັດສະຕັອກໄປແລ້ວ ຫຼື ຍັງ (ກັນຕັດຊ້ຳສອງເທື່ອ)
alter table orders add column if not exists "stockDeducted" boolean not null default false;

-- ບັນທຶກເວລາຮັບອໍເດີ ແລະ ເວລາສັ່ງສິນຄ້າຈາກຮ້ານຕົ້ນທາງ
alter table orders add column if not exists "acceptedAt" timestamptz;
alter table orders add column if not exists "orderedAt" timestamptz;

-- ອໍເດີເກົ່າທີ່ສ້າງກ່ອນອັບເດດນີ້ ຖືວ່າຕັດສະຕັອກໄປແລ້ວ
update orders set "stockDeducted" = true
where "stockDeducted" = false and status not in ('new', 'cancelled');
