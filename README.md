# Vulnpokalypse Tracker

Vulnpokalypse Tracker is a client-side vulnerability intelligence and security advisory aggregator built with vanilla HTML, CSS, and JavaScript. It continuously pulls security RSS/Atom feeds and enrichment sources directly in the browser, extracts CVE identifiers into labels, and automatically groups related advisories around focused vulnerabilities so you do not have to read duplicate coverage of the same vulnerability across multiple sources. All data is stored locally in the browser using HTML5 IndexedDB.

## Usage

The app is hosted at https://maddud.github.io/vulnpokalypse-tracker

- The application regularly pulls new articles from configured RSS feeds and puts them to the left panel.
- User can add, remove and disable rss feeds.
- User reviews new articles and marks interesting subjects by clicking "Focus" button. This moves the article to the right panel, and automatically enreaches the article based on cve numbers in the Label metadata, with Tenable Nessus plugins and looks up if any of the CVEs is exploitable. 
- script also identifies if there are any other article in the left panel with the same labels (cves), and automatically links them with the article in the Focus panel, and removes them from the left panel.
- User can add any custom label such as php2shell, which will be used to link other articles.
- User can add custom comment to every Focused article
- The application continously scans newly pulled rss articles, links them with Focus articles and highlights Focus articles which have been linked to new articles.
- All actions are documented in log events - global and Focus articles.

## Installation and Run

No build step, package manager, or backend server is required.


1. Clone the repository
2. Open the `index.html` file in a browser straight from the local filesystem

## Note

This application was created with Google Antigravity AI.
