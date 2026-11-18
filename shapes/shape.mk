##@ Shapes (template only: shape/keep removes them)

REGISTRIES := backend/src/router.ts frontend/src/pages.ts

.PHONY: shape/list
shape/list: node_modules ## List the shapes that can be kept alone (building blocks with no page are left out)
	node shapes/shape.ts list

.PHONY: shape/recipes
shape/recipes: node_modules ## List the recipes for trade-specific apps and the shapes each keeps (docs/recipes/)
	node shapes/shape.ts recipes

.PHONY: shape/registries
shape/registries: node_modules ## Rewrite the router and pages registries from the shape manifests
	node shapes/shape.ts registries
	$(JS_EXEC) exec prettier -- --write $(REGISTRIES) >/dev/null

.PHONY: shape/keep
shape/keep: node_modules ## Make this copy a project: keep NAMES="a b" or RECIPE=name and what they require, delete the rest
	$(if $(strip $(NAMES) $(RECIPE)),,$(error Set NAMES to the shapes to keep, for example NAMES="notes", or RECIPE to one from make shape/recipes))
	$(if $(and $(strip $(NAMES)),$(strip $(RECIPE))),$(error Set NAMES or RECIPE, not both))
	$(if $(strip $(RECIPE)),node shapes/shape.ts recipe $(RECIPE),node shapes/shape.ts keep $(NAMES))
	$(JS_EXEC) exec prettier -- --write $(REGISTRIES) >/dev/null
	$(MAKE) db/generate NAME=init

# ponytail: cases run one after another, each with its own `npm ci`. Move them
# to a CI matrix once there are enough shapes and recipes for that to be slow.
.PHONY: shape/check
shape/check: docker/check node_modules ## Prove each shape alone and each recipe pass check, test, build (NAMES="a b" or RECIPE=name for one)
	$(JS_EXEC) exec tsc -- -p shapes
	$(JS_EXEC) exec vitest -- run --root shapes
	work=$$(mktemp -d)
	trap 'rm -rf "$$work"' EXIT
	cp $(REGISTRIES) "$$work"
	$(MAKE) shape/registries
	for file in $(REGISTRIES); do
		if ! diff -u "$$work/$$(basename $$file)" $$file; then
			echo "Error: $$file did not match the shape manifests. It has been rewritten; review and commit it."
			exit 1
		fi
	done
	count=0
	# $$1 is what shape/keep is given: NAMES="a b" or RECIPE=name.
	check_one() {
		count=$$((count + 1))
		local dir="$$work/shape-check-$$count"
		echo "== shape/check: $$1"
		mkdir "$$dir"
		git ls-files -co --exclude-standard -z | tar --null -T - -cf - | tar -xf - -C "$$dir"
		(cd "$$dir" && $(JS_EXEC) ci --prefer-offline --no-audit --no-fund >/dev/null)
		$(MAKE) -C "$$dir" shape/keep "$$1"
		$(MAKE) -C "$$dir" check test build
	}
	if [ -n "$(strip $(NAMES))" ]; then
		check_one "NAMES=$(strip $(NAMES))"
	elif [ -n "$(strip $(RECIPE))" ]; then
		check_one "RECIPE=$(strip $(RECIPE))"
	else
		for name in $$(node shapes/shape.ts list); do check_one "NAMES=$$name"; done
		for name in $$(node shapes/shape.ts recipes | cut -f1); do check_one "RECIPE=$$name"; done
	fi
