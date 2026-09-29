-- 2026-09-28 (2º audio del empresario) · Recuperar nº de mancato y link de TODO
-- el histórico, no solo del 14/15 de septiembre.
--
-- Contexto: hasta el 16/09 el formulario móvil de Peajes no tenía campos para el
-- nº de mancato ni para el link (se agregaron en el commit 230c635), así que los
-- choferes los escribían en Comentarios. El panel lee id_multa / archivo, por eso
-- esas filas salen con "—" y el admin no puede pagarlas.
--
-- Qué hace: por cada peaje SUELTO sin nº, saca del comentario
--   · el nº de mancato  -> primera (y única) secuencia de 6+ dígitos
--   · el link de pago   -> primer dominio .it/.com/.eu/.net/.org
-- y los escribe en id_multa / archivo. El comentario original NO se borra.
--
-- Salvaguardas:
--   · solo toca filas con id_multa vacío,
--   · el link solo se escribe si `archivo` está vacío (hay 2 filas donde `archivo`
--     guarda la FOTO del ticket, no un link: esas conservan su foto),
--   · los gastos de operación no entran: ya no queda ninguno recuperable.
-- Validado antes de correr (86 filas): 86/86 con nº, 78/86 con link, un solo
-- número de 6+ dígitos por comentario, cero duplicados contra lo ya registrado.
-- Idempotente: re-ejecutarlo no cambia nada.

begin;

with cand as (
  select p.id,
         substring(p.comentarios from '[0-9]{6,}') as nro,
         substring(lower(p.comentarios) from
           '((https?://)?(www\.)?([a-z0-9-]+\.)+(it|com|eu|net|org)([a-z0-9/._?=&-]*))') as link
  from peajes p
  where coalesce(p.id_multa,'') = ''
    and (p.comentarios ~ '[0-9]{6,}' or p.comentarios ~* '(www\.|https?://)')
)
update peajes p
   set id_multa = c.nro,
       -- el link solo si no hay nada en `archivo` (no pisar una foto ya subida)
       archivo  = case when coalesce(p.archivo,'') = '' then c.link else p.archivo end
  from cand c
 where p.id = c.id
   and c.nro is not null;

commit;

-- Verificación
select count(*) as recuperados_con_nro
  from peajes
 where coalesce(id_multa,'') <> ''
   and comentarios ~ '[0-9]{6,}';

select count(*) as quedan_sin_nro_recuperable
  from peajes
 where coalesce(id_multa,'') = ''
   and (comentarios ~ '[0-9]{6,}' or comentarios ~* '(www\.|https?://)');

select fecha::date, monto, targa, id_multa, left(coalesce(archivo,''),40) as link_o_foto
  from peajes
 where coalesce(id_multa,'') <> '' and comentarios ~ '[0-9]{6,}'
 order by fecha desc
 limit 12;
