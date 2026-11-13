# Use Investigator Website Builder on Windows

Install Node.js once, unzip the builder, and double-click **Start Builder.cmd**.
You edit your website in a browser on your own computer. When the content is
ready, the builder creates website files for you to upload to Cloudflare.
These steps use Windows directly and need only Node.js 24.

## Know which download you have

| Item | What it contains | What you do with it |
| --- | --- | --- |
| **Builder app ZIP** — `investigator-website-builder-v1.0.0-windows.zip` | The shared builder, its launcher, and instructions | Extract it and run **Start Builder.cmd**. |
| **Blank content ZIP** | Editable pages, profile details, and places for your photos and records | Extract it into a separate folder, then open that folder in the builder. You can also create a blank content pack inside the builder. |
| **Published website** | Generated website files, including `index.html` | Upload the release folder to your Cloudflare Pages project. |

Keep your content folder when you update the builder. It holds your writing,
photos, saved drafts, and review history. The builder can open different people's
content folders without mixing their records.

## Set up the builder

1. Visit the [official Node.js download page](https://nodejs.org/en/download).
   Select **Node.js 24**, **Windows**, and the **Windows Installer (.msi)** for
   your computer. Run the installer with its normal settings, including npm.
2. In File Explorer, right-click the builder ZIP and choose **Extract All**.
   Choose somewhere you can keep it, such as your Documents folder. Open the
   extracted `investigator-website-builder` folder before starting the builder.
3. Double-click **Start Builder.cmd**. The first start needs an internet
   connection to download the builder's dependencies. Leave its window open
   while this finishes; later starts reuse the installed files.
4. Open the editor address shown in that window, normally
   `http://127.0.0.1:4310/`, if your browser has not opened it already.

The launcher window keeps the editor running. Leave it open while you work.
When finished, save your work, select that window, and press **Ctrl+C** to stop
the editor and its local preview. If Windows asks whether to end the batch job,
confirm. Closing the browser tab alone leaves the editor running.

## Create or open your content folder

Keep the builder, editable content, and generated releases in separate folders.
For example:

```text
C:\Websites\
  investigator-website-builder\  The extracted builder app
  Alex content\                  Alex's editable website content
  Releases\
    alex-001\                    The first generated website release
    alex-002\                    A later generated website release
```

Use your own name and preferred location. In File Explorer, you can click the
address bar to copy a folder's full path, then paste it into the builder's
**Folder path** field without quotation marks.

**Starting from scratch:** choose **Create blank content pack** on the editor's
welcome screen. Enter a new folder path outside the builder, such as
`C:\Websites\Alex content`, then choose **Create content pack**. The parent
folder, here `C:\Websites`, must already exist. Let the builder create the new
content folder.

**Opening an existing pack:** extract its ZIP first. Choose **Open a folder**,
then paste the extracted folder's path or use **Browse folders**. Select the
folder containing both `site.json` and `content`, then choose **Open content
folder**. If extraction added an outer folder, open it to find the folder with
those two items.

Check the selected investigator and folder shown at the top of the editor.
**Change folder** opens another content pack and stops the previous pack's
preview.

## Edit, review, and preview

1. Under **Profile & pages**, start with your profile and public contact details.
   Open **Pages** to write each page and choose its sections, records, and photos.
   Add cases under **Cases** and other records in their named groups.
2. Choose **Save working draft** to keep your edits. This saves unfinished work
   separately from the website record.
3. Choose **Review changes** to see the differences and any problems to resolve.
4. Choose **Apply as draft** when you want the saved work to appear in your local
   website preview. Site settings use **Apply settings**.
5. Open **Preview & release**, choose **Start local preview**, and wait for its
   ready link. Open that link, normally `http://127.0.0.1:4323/`.

The preview includes applied draft and published records. A working draft must
be applied before it appears there. When you add a record, select it in the
relevant page's section too; check that the section is enabled. Save, review,
and apply the page change separately.

Keep optional sections empty until you have content for them. Unknown optional
dates and amounts can stay blank. The blank pack starts in draft, so a published
release needs a review and publication step first.

Editing, saving, and previewing happen locally. Your live website changes when
you upload a new published release.

## Build the published website

1. Review the finished records with the person responsible for publication.
   Choose **Apply as published** for approved records and pages. Publish the
   records a page selects before publishing that page. The Home page must be
   published before a release can be created.
2. Under **Preview & release**, choose **Check content**. Resolve any reported
   field or reference problems, then check again.
3. Create a place for your releases in File Explorer, such as
   `C:\Websites\Releases`. In **New release folder**, enter an unused folder
   inside it, such as `C:\Websites\Releases\alex-001`. Let the builder create
   `alex-001`; it must not already exist. The release folder must be outside both
   the builder and your editable content folder.
4. Choose **Build published release** and wait for successful completion. Open
   the resulting folder in File Explorer. Its top level contains `index.html`.

The release contains published website files. Working drafts, records still
marked draft, and local draft history are excluded. Building prepares the files;
uploading them is a separate step.

Checks and release builds stop the local preview while they run. Wait for a job
to finish before starting another or changing content folders. Choose **Start
local preview** again when you want to resume reviewing.

## Upload to the same Cloudflare Pages project

For a Pages project set up for **Direct Upload**:

1. Sign in to Cloudflare and open **Workers & Pages**.
2. Open the existing project for this investigator and choose **Create a new
   deployment**. Choose **Production** when you are ready to update the public
   site.
3. Upload the complete generated release folder, such as `alex-001`, with
   `index.html` at its top level. Complete the upload and deployment.
4. Open the site's public address and check your changes.

For the first release, create the investigator's Pages project using
Cloudflare's [Direct Upload instructions](https://developers.cloudflare.com/pages/get-started/direct-upload/).
For later releases, keep using that same project so the website address and
domain stay connected. Dashboard uploads require a Direct Upload project; ask
the coordinator to handle deployment if the existing project uses Git.

Upload the generated website folder. Keep the builder app, editable content,
and draft preview on your computer. Cloudflare does not read later edits from
your local content folder.

## Make the next update

Double-click **Start Builder.cmd**, open the same content folder, and repeat the
save, review, apply, and preview steps. Publish the approved changes, then build
into a fresh release folder such as `alex-002`. Upload that release to the same
Cloudflare Pages project.

Back up the whole editable content folder, including its photos and the
`.website-editor` directory. That directory holds working drafts and recovery
copies of replaced records; those copies do not replace a full folder backup.
Your published website cannot restore unfinished writing or review history.

When you receive a newer builder app, stop the old builder and extract the new
app into a separate folder. Start the new copy and open your existing content
folder. Keep your content and backups separate from the app being replaced.

## If something does not start

- **Node.js is missing or the version is wrong:** install Node.js 24, close the
  launcher window, and start **Start Builder.cmd** again.
- **The first download fails:** check your internet connection and start the
  launcher again. If it still fails, share the message shown in its window with
  the coordinator.
- **The editor address is already in use:** check for another open builder
  window. Use that editor or stop that copy before launching again.
- **A change is absent from preview:** save, review, and apply the record; check
  its page selection and enabled section, then refresh the preview.
- **The preview cannot start:** read the message under **Preview & release**.
  Another preview may already be using its address; stop your earlier preview
  before trying again.
- **The release folder already exists:** enter a fresh name such as `alex-003`.
  Existing releases are kept intact.
- **The published website is missing a change:** check that the affected record
  and page were applied as published, then build and upload a fresh release.

See the [editor guide](editor.md) for field controls and recovery details, and
the [Cloudflare guide](cloudflare-pages.md) for other deployment methods.
