# Tripadvisor Management Center

The initial authenticated capture on 10 October 2026 includes nine enrolled
businesses: four hotels, two cafés, and three minimarts. Each overview's
`locationId` was checked against the directory's canonical Tripadvisor
`-d<id>-` link before importing any values.

The capture stores overall rating, total review count, and the ranking shown
on the signed-in overview. Rankings retain their actual comparison group:
`hotel`, `restaurant`, `attraction`, `b_and_b`, or `specialty_lodging`.
For example, Yzistel is ranked among B&Bs/inns in Cam Pho, while Vistara Gia
Lai is ranked among specialty lodging in Quy Nhon.

Existing installations should run
`supabase/tripadvisor-lodging-categories.sql` after
`tripadvisor-ranking.sql` and `manual-summary.sql`.
The migration is repeatable and preserves existing observations.

This first capture uses the manual observation ingestor, with an immutable
history entry and a note identifying Tripadvisor Management Center and the
verified location ID. It does not enable a periodic authenticated collector.
A listing showing zero reviews and no overall rating must keep its score
empty; the empty bubble graphic is not a score of zero.
