# BI Portfolio Template

A simple, dependency-free portfolio site for a Business Intelligence student.

```
bi-portfolio/
├── index.html                  ← the page (edit your content here)
├── styles.css                  ← colors, layout (change --accent to rebrand)
├── script.js                   ← dark mode + project filters
├── assets/                     ← put cv.pdf and dashboard screenshots here
└── projects/
    └── project-template.md     ← copy once per project for the case study
```

## Open it in VS Code
1. **File → Open Folder…** and pick `bi-portfolio`.
2. Install the **Live Server** extension (by Ritwick Dey).
3. Right-click `index.html` and choose **Open with Live Server**. The page reloads every time you save.

(You can also just double-click `index.html` to open it in a browser.)

## Personalize it
- [ ] Replace **Your Name**, university, city, email, LinkedIn and GitHub links in `index.html`
- [ ] Update the hero stats (projects, industries, rows)
- [ ] Add `assets/cv.pdf`
- [ ] For each project: write the business question, a key insight with a number, the tools, and real links
- [ ] Replace each emoji thumbnail with a screenshot: `<img class="thumb" src="assets/project1.png" alt="Sales dashboard">`
- [ ] Copy `projects/project-template.md` for each case study (or keep the case studies in each project's GitHub README)
- [ ] Change the brand color: edit `--accent` in `styles.css`

## Add a project
Copy an `<article class="project">…</article>` block in `index.html`. The `data-tags` value controls the filters: use `dashboard`, `sql`, `modeling` or `python`, separated by spaces.

## Publish it for free
- **GitHub Pages:** push this folder to a repo, then go to Settings → Pages → Deploy from branch.
- **Netlify / Vercel:** drag and drop the folder.
