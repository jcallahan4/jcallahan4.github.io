# CV source

`main.tex` is the editable source for the CV published on the website.

From the repository root, run:

```sh
make cv
```

This compiles the source and its bibliographies into `static/files/cv.pdf`.
It requires a local LaTeX installation with `latexmk`, `pdflatex`, and Biber.
Temporary compiler files are stored in the ignored `.cache/latex/` directory.
