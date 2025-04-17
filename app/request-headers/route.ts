import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const headers = Object.fromEntries(request.headers);
  
  // Create HTML with responsive design for mobile screens
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Request Headers</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          padding: 10px;
          margin: 0;
          background-color: #f5f5f5;
        }
        h1 {
          font-size: 1.5rem;
          text-align: center;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.9rem;
          margin: 0 auto;
        }
        th, td {
          padding: 8px;
          text-align: left;
          border-bottom: 1px solid #ddd;
          word-break: break-all;
        }
        th {
          background-color: #f2f2f2;
          position: sticky;
          top: 0;
        }
        tr:nth-child(even) {
          background-color: #f9f9f9;
        }
        .key {
          font-weight: bold;
          width: 40%;
        }
        .value {
          width: 60%;
        }
        @media screen and (max-width: 480px) {
          table {
            font-size: 0.8rem;
          }
          th, td {
            padding: 6px 4px;
          }
          .key {
            width: 35%;
          }
          .value {
            width: 65%;
          }
        }
      </style>
    </head>
    <body>
      <h1>Request Headers</h1>
      <table>
        <thead>
          <tr>
            <th class="key">Header</th>
            <th class="value">Value</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(headers)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `
              <tr>
                <td class="key">${key}</td>
                <td class="value">${value}</td>
              </tr>
            `)
            .join('')}
        </tbody>
      </table>
    </body>
    </html>
  `;

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html',
    },
  });
}
