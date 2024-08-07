import { useState } from "react";
import { json } from "@remix-run/node";
import { useLoaderData} from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  IndexTable,
  useBreakpoints,
  Button,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import PrintModal from "../utils/PrintModal";

async function fetchOrders(admin) {
  const query = `
    query getOrders {
      orders(first: 100, query: "fulfillment_status:unfulfilled") {
      nodes {
        name
        id
        createdAt
        customer {
          displayName
        }
        displayFinancialStatus
        displayFulfillmentStatus
        lineItems(first: 100) {
          edges {
            node {
              title
              quantity
              originalUnitPriceSet {
                presentmentMoney {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
        totalPriceSet {
          presentmentMoney {
            amount
            currencyCode
          }
        }
        subtotalPriceSet { 
          presentmentMoney { 
            amount 
            currencyCode 
          } 
        }
        totalTaxSet {
          presentmentMoney {
            amount
            currencyCode
          }
        }
      }
    }
  }
  `;
  const response = await admin.graphql(query);
  return response.json();
}

export const loader = async ({ request }) => {
  try {
    const { admin } = await authenticate.admin(request);
    const data = await fetchOrders(admin);
    const orders = data.data.orders.nodes.map(node => ({
      id: node.name,
      order: node.id,
      displayName: node.customer.displayName,
      totalPrice: formatCurrency(parseFloat(node.totalPriceSet.presentmentMoney.amount)),
      subtotalPrice: formatCurrency(parseFloat(node.subtotalPriceSet.presentmentMoney.amount)),
      totalTax: formatCurrency(parseFloat(node.totalTaxSet.presentmentMoney.amount)),
      displayFinancialStatus: node.displayFinancialStatus,
      displayFulfillmentStatus: node.displayFulfillmentStatus,
      createdAt: node.createdAt.split('T')[0],
      items : node.lineItems.edges,
    }))
    .sort((a, b) => b.id.localeCompare(a.id));
    return json(orders);
  } catch (error) {
    console.error('app._index Loader Error:', error);
    return json({ error: 'Failed to fetch orders.' }, { status: 500 });
  }
};

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(amount);
};

export default function Index() {
  const orders = useLoaderData();
  const [selectedOrder, setSelectedOrder] = useState(null);

  const resourceName = {
    singular: 'order',
    plural: 'orders',
  };

  const rowMarkup = orders.map((order, index) => (
    <IndexTable.Row id={order.id} key={order.id} position={index}>
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="bold" as="span">
            {order.id}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>{order.createdAt}</IndexTable.Cell>
        <IndexTable.Cell>{order.displayName}</IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span">
            {order.totalPrice}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>{order.displayFinancialStatus}</IndexTable.Cell>
        <IndexTable.Cell>{order.displayFulfillmentStatus}</IndexTable.Cell>
        <IndexTable.Cell>
        <Button onClick={() => setSelectedOrder(order)}>領収書</Button>
        </IndexTable.Cell>
      </IndexTable.Row>
  ));

  return (
    <Page fullWidth>
      <Layout>
        <Layout.Section>
          <Card>
            <IndexTable
              condensed={useBreakpoints().smDown}
              resourceName={resourceName}
              itemCount={orders.length}
              headings={[
                {title: '注文'},
                {title: '日付'},
                {title: 'お客様（請求先／配送先）'},
                {title: '合計'},
                {title: '支払い'},
                {title: 'フルフィルメント'},
                {title: ''},
              ]}
              selectable={false}
            >
              {rowMarkup}
            </IndexTable>
          </Card>
        </Layout.Section>
      </Layout>
      {selectedOrder && (
        <PrintModal
          order={selectedOrder}
          open={() => setSelectedOrder(null)}
        />
      )}
    </Page>
  );
}