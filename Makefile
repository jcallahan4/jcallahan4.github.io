.PHONY: cv

# Build the website-ready CV from the tracked Overleaf source.  latexmk handles
# the required LaTeX/biber passes; auxiliary files are kept out of the tree.
cv:
	@mkdir -p .cache/latex static/files
	cd cv && latexmk -pdf -interaction=nonstopmode -halt-on-error \
		-jobname=cv -outdir=../static/files -auxdir=../.cache/latex main.tex
