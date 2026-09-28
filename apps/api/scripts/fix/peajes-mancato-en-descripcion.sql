-- 2026-09-28 · Audio del empresario: "los peajes del 13/14 sep no muestran nada".
--
-- Causa: el formulario móvil de Peajes no tenía campos Nº de mancato ni Link
-- hasta el 16/09 (commit 230c635), ni foto hasta el 18/09 (commit d907823), así
-- que Carlos Rojas escribió el número y el link en Comentarios (-> descripcion).
-- El panel de Peajes lee numero_mancato/link_peaje, por eso salían "—".
--
-- Este script hace dos cosas:
--   (1) borra un gasto de PRUEBA que entró por error durante un QA,
--   (2) recupera nº y link de esas 7 filas (solo si siguen vacías).
-- Es idempotente: re-ejecutarlo no cambia nada.

begin;

-- (1) Gasto de prueba QA (operación Medtronic del 28/09) — borrar
delete from gastos_operacion
where id = '5cb78baa-a0e0-49e2-b768-1126b185de4f'
  and numero_mancato = 'QA-WEB-7777';

-- (2) Backfill de los 7 peajes de Carlos Rojas (14 y 15 de septiembre)
update gastos_operacion set numero_mancato='4083635971', link_peaje='www.autostrade.it'
 where id='06b63e92-a2aa-48f5-9211-3778b0f58c35' and coalesce(numero_mancato,'')='';
update gastos_operacion set numero_mancato='4083722183', link_peaje='www.autostrade.it'
 where id='642959b1-71bf-4edd-b836-81c09e82de4c' and coalesce(numero_mancato,'')='';
update gastos_operacion set numero_mancato='3195078005', link_peaje='www.satapweb.it'
 where id='7f31714d-c841-4392-986c-f3853fa8ca12' and coalesce(numero_mancato,'')='';
update gastos_operacion set numero_mancato='6453054543', link_peaje='www.itpspa.it'
 where id='cc339635-e0a6-4194-8895-95fee86fca0b' and coalesce(numero_mancato,'')='';
update gastos_operacion set numero_mancato='6453054972', link_peaje='www.itpspa.it'
 where id='957e8deb-69d9-4ac7-b910-016fbb51c1d0' and coalesce(numero_mancato,'')='';
update gastos_operacion set numero_mancato='3195078757', link_peaje='www.satapweb.it'
 where id='4e57450a-82c4-402a-b164-e22d0dba1d46' and coalesce(numero_mancato,'')='';
update gastos_operacion set numero_mancato='5148276636', link_peaje='www.serravalle.it'
 where id='99c0625c-c73a-4ec1-8bcb-dc31b5492b6d' and coalesce(numero_mancato,'')='';

commit;

-- Verificación: las 7 filas deben salir con nº y link; la de QA, 0 filas.
select fecha::date, monto, numero_mancato, link_peaje, targa
  from gastos_operacion
 where id in ('06b63e92-a2aa-48f5-9211-3778b0f58c35','642959b1-71bf-4edd-b836-81c09e82de4c',
              '7f31714d-c841-4392-986c-f3853fa8ca12','cc339635-e0a6-4194-8895-95fee86fca0b',
              '957e8deb-69d9-4ac7-b910-016fbb51c1d0','4e57450a-82c4-402a-b164-e22d0dba1d46',
              '99c0625c-c73a-4ec1-8bcb-dc31b5492b6d')
 order by fecha, monto;

select count(*) as filas_qa_restantes from gastos_operacion where numero_mancato = 'QA-WEB-7777';
