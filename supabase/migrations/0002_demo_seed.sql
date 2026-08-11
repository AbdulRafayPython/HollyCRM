-- =============================================================================
-- HollyCRM — demo seed data
--
-- NOTE: hotel names, prices and distances below are FICTIONAL demo data invented
-- for the purpose of exercising search_hotels(). Replace with real Hollyland
-- inventory before showing anything to a customer.
--
-- Run AFTER 0001_hollycrm_init.sql.
-- =============================================================================

do $$
declare
  v_org  uuid;
  v_hotel uuid;
  v_rt   uuid;
begin

  insert into public.organizations (name, timezone, currency)
  values ('Hollyland Travel (Demo)', 'Asia/Riyadh', 'SAR')
  returning id into v_org;

  raise notice 'Demo org id: %', v_org;

  -- ---------------------------------------------------------------------------
  -- MAKKAH
  -- ---------------------------------------------------------------------------
  insert into public.hotels (org_id, name, city, star_rating, distance_to_haram_m,
                             has_shuttle, shuttle_minutes, description, amenities)
  values (v_org, 'Ajyad Grand Makkah', 'Makkah', 5, 250, false, null,
          'Five-star tower on the Ajyad side with direct Haram views from upper floors. '
          'Walking distance to King Abdulaziz gate, buffet dining, family-friendly floors.',
          array['haram_view','buffet','family_floors','wifi'])
  returning id into v_hotel;

  insert into public.hotel_room_types (hotel_id, name, config, capacity)
  values (v_hotel, 'Double Room', 'double', 2) returning id into v_rt;
  insert into public.hotel_rates (room_type_id, valid_from, valid_to, price_per_night, allotment, season_label) values
    (v_rt, '2026-08-01', '2026-11-30', 780.00, 20, 'Off-peak'),
    (v_rt, '2026-12-01', '2027-01-31', 1150.00, 12, 'High season');

  insert into public.hotel_room_types (hotel_id, name, config, capacity)
  values (v_hotel, 'Quad Room', 'quad', 4) returning id into v_rt;
  insert into public.hotel_rates (room_type_id, valid_from, valid_to, price_per_night, allotment, season_label) values
    (v_rt, '2026-08-01', '2026-11-30', 1180.00, 15, 'Off-peak'),
    (v_rt, '2026-12-01', '2027-01-31', 1690.00, 8, 'High season');

  insert into public.hotels (org_id, name, city, star_rating, distance_to_haram_m,
                             has_shuttle, shuttle_minutes, description, amenities)
  values (v_org, 'Misfalah Comfort Suites', 'Makkah', 4, 900, true, 10,
          'Budget-conscious four-star in Misfalah with a 24-hour shuttle to the Haram. '
          'Popular with larger family groups and sharing configurations.',
          array['shuttle','laundry','wifi'])
  returning id into v_hotel;

  insert into public.hotel_room_types (hotel_id, name, config, capacity)
  values (v_hotel, 'Triple Room', 'triple', 3) returning id into v_rt;
  insert into public.hotel_rates (room_type_id, valid_from, valid_to, price_per_night, allotment, season_label) values
    (v_rt, '2026-08-01', '2026-11-30', 460.00, 30, 'Off-peak'),
    (v_rt, '2026-12-01', '2027-01-31', 690.00, 20, 'High season');

  insert into public.hotel_room_types (hotel_id, name, config, capacity)
  values (v_hotel, 'Quad Room', 'quad', 4) returning id into v_rt;
  insert into public.hotel_rates (room_type_id, valid_from, valid_to, price_per_night, allotment, season_label) values
    (v_rt, '2026-08-01', '2026-11-30', 540.00, 25, 'Off-peak'),
    (v_rt, '2026-12-01', '2027-01-31', 810.00, 14, 'High season');

  insert into public.hotels (org_id, name, city, star_rating, distance_to_haram_m,
                             has_shuttle, shuttle_minutes, description, amenities)
  values (v_org, 'Al Naseem Residence', 'Makkah', 3, 1600, true, 15,
          'Simple, clean three-star aimed at economy groups. Shuttle every 20 minutes, '
          'self-service kitchenette on each floor.', array['shuttle','kitchenette'])
  returning id into v_hotel;

  insert into public.hotel_room_types (hotel_id, name, config, capacity)
  values (v_hotel, 'Sharing Bed', 'sharing', 1) returning id into v_rt;
  insert into public.hotel_rates (room_type_id, valid_from, valid_to, price_per_night, allotment, season_label) values
    (v_rt, '2026-08-01', '2027-01-31', 150.00, 60, 'All-year');

  -- ---------------------------------------------------------------------------
  -- MADINAH
  -- ---------------------------------------------------------------------------
  insert into public.hotels (org_id, name, city, star_rating, distance_to_haram_m,
                             has_shuttle, shuttle_minutes, description, amenities)
  values (v_org, 'Markaziyah Rose Madinah', 'Madinah', 5, 180, false, null,
          'Central Area five-star, a short walk from the Prophets Mosque northern courtyard. '
          'Quiet rooms suitable for elderly travellers.', array['central_area','buffet','wifi','elevator_access'])
  returning id into v_hotel;

  insert into public.hotel_room_types (hotel_id, name, config, capacity)
  values (v_hotel, 'Double Room', 'double', 2) returning id into v_rt;
  insert into public.hotel_rates (room_type_id, valid_from, valid_to, price_per_night, allotment, season_label) values
    (v_rt, '2026-08-01', '2026-11-30', 620.00, 25, 'Off-peak'),
    (v_rt, '2026-12-01', '2027-01-31', 940.00, 15, 'High season');

  insert into public.hotel_room_types (hotel_id, name, config, capacity)
  values (v_hotel, 'Quad Room', 'quad', 4) returning id into v_rt;
  insert into public.hotel_rates (room_type_id, valid_from, valid_to, price_per_night, allotment, season_label) values
    (v_rt, '2026-08-01', '2026-11-30', 980.00, 18, 'Off-peak'),
    (v_rt, '2026-12-01', '2027-01-31', 1420.00, 9, 'High season');

  insert into public.hotels (org_id, name, city, star_rating, distance_to_haram_m,
                             has_shuttle, shuttle_minutes, description, amenities)
  values (v_org, 'Taibah Gate Hotel', 'Madinah', 4, 700, true, 8,
          'Four-star just outside the Central Area with frequent shuttle service. '
          'Good value for medium-sized groups.', array['shuttle','buffet','wifi'])
  returning id into v_hotel;

  insert into public.hotel_room_types (hotel_id, name, config, capacity)
  values (v_hotel, 'Triple Room', 'triple', 3) returning id into v_rt;
  insert into public.hotel_rates (room_type_id, valid_from, valid_to, price_per_night, allotment, season_label) values
    (v_rt, '2026-08-01', '2026-11-30', 400.00, 35, 'Off-peak'),
    (v_rt, '2026-12-01', '2027-01-31', 600.00, 22, 'High season');

end $$;

-- =============================================================================
-- Smoke test — run this to prove the corrected retrieval path works.
-- Expect: only hotels that are 5-star, within 500m (or shuttle), fully priced
-- for the whole stay, with allotment >= rooms, and fitting the party size.
-- Note p_query_embedding is omitted entirely -> works with zero embeddings.
-- =============================================================================
-- select * from public.search_hotels(
--   p_city                => 'Makkah',
--   p_check_in            => '2026-09-10',
--   p_check_out           => '2026-09-15',
--   p_pax                 => 8,
--   p_rooms               => 2,
--   p_max_price_per_night => 1300,
--   p_max_distance_m      => 500,
--   p_min_stars           => 4
-- );
