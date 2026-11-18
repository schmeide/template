# Deals

A pipeline: records that move through an ordered set of stages, shown as a board. This shape ships it as a sales CRM
of deals. Lead trackers, applicant tracking, support tickets, task boards, customer onboarding, and claims and
returns are the same shape with different names, stages and fields.

## What it has

- **Stages** (`pipeline_stages` table, Stages view at `#/deals/stages`): a name, a position, and whether the stage
  closes a deal as won or lost. Add, rename, reorder. A database with no stages gets the defaults in
  `defaultStages` in `backend/src/services/pipeline.ts` the first time the board loads: Lead, Qualified, Proposal,
  Negotiation, Won and Lost.
- **Deals** (`pipeline_items` table, Deals page): title, stage, position in the stage, owner, value, due date and a
  contact. The contact is a customer from the `customers` shape, which this one requires.
- **Board** (`#/deals`): a column per stage with its count and total value. A deal moves by dragging it to another
  column or onto another card, or with its Up, Down and "To <stage>" buttons, which work from the keyboard. A screen
  reader hears where the deal landed.
- **Table** (`#/deals/table`): every deal with a stage filter and a search over title, contact and owner.
- **Deal page** (`#/deals/<id>`): edit the fields, move to any stage, add notes, and read the activity timeline.
- **Slot**: the deal page renders `<Slots name="deal" id={id} />` below the title, where link shapes add their
  views. With no link shape kept it renders nothing.
- **Activity** (`pipeline_activity` table): notes, and a row for every stage change, written in the same transaction
  as the move. Reordering within a stage is not recorded.
- **Ordering**: positions in a stage run 0, 1, 2 with no gaps. A move locks the deal's stage row and the target
  stage row, in id order, and shifts the other deals inside that transaction, so two people moving deals at once
  queue instead of colliding. Creating a deal locks its stage the same way. Changing the stage list locks the whole
  stages table.

## What usually varies

- The item's name: deal, lead, candidate, ticket, task.
- The stage list (`defaultStages`, or the Stages view in a running app).
- The item's fields, and whether it has a money value at all.

## Turning deals into support tickets

1. Rename the router key, page path, title and copy from deal to ticket: `deals.shape.json` (then
   `make shape/registries`), `backend/src/routers/deals.ts` and `frontend/src/deals/`. The tables keep their
   generic names.
2. Replace `defaultStages` with New, Open, Waiting on customer, Solved (closes as won) and Closed (closes as lost).
3. Drop the value: remove the `value` column, its check and its inputs, and the total in each column summary
   (`getBoard`). Run `make db/generate NAME=drop_ticket_value`.
4. Add what tickets need, such as a priority enum column, the same way. The contact stays the customer who asked.
5. Run `make check test build`.

Applicant tracking, task boards and onboarding follow the same steps with their own stages and fields.

## Limits

- **Owner** is free text, because without sign-in there is no users table to point at. Make it a reference to users
  once sign-in exists.
- **Value** is whole units of one currency (`currency` in `frontend/src/deals/format.ts`). A project that needs
  cents or several currencies moves it to minor units with a currency column and shares the money building block
  from invoices, moved into a shape of its own.
- Stages cannot be deleted. Rename one, or move its deals out and leave it at the end.
- Deals are not deleted; close them as won or lost.
- The board and the table load every deal without paging, and the table filters in the browser.
